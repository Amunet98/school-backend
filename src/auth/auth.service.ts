import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../common/prisma/prisma.service';
import type {
  JwtAccessPayload,
  JwtRefreshPayload,
  UserRoleName,
} from '../common/interfaces/jwt-payload.interface';
import { OtpService } from './otp.service';
import { SMS_GATEWAY, type SmsGateway } from './sms/sms-gateway.interface';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  roles: UserRoleName[];
}

type UserWithRoles = {
  id: bigint;
  schoolId: bigint | null;
  phone: string;
  passwordHash: string | null;
  isActive: boolean;
  roles: { role: UserRoleName }[];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
    @Inject(SMS_GATEWAY) private readonly smsGateway: SmsGateway,
  ) {}

  async login(phone: string, password: string): Promise<AuthTokens> {
    // Phone is unique per-school, not globally, so a phone can legitimately
    // belong to accounts in more than one school. Try every active
    // candidate and return the one whose password matches.
    const candidates = (await this.prisma.user.findMany({
      where: { phone, isActive: true },
      include: { roles: true },
    })) as UserWithRoles[];

    for (const candidate of candidates) {
      if (!candidate.passwordHash) continue;
      const matches = await argon2.verify(candidate.passwordHash, password);
      if (matches) {
        return this.issueTokensFor(candidate);
      }
    }

    throw new UnauthorizedException('Invalid phone or password');
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtRefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtRefreshPayload>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = (await this.prisma.user.findUnique({
      where: { id: BigInt(payload.user_id) },
      include: { roles: true },
    })) as UserWithRoles | null;

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return this.issueTokensFor(user);
  }

  async requestOtp(phone: string): Promise<void> {
    const candidates = (await this.prisma.user.findMany({
      where: { phone, isActive: true },
      include: { roles: true },
    })) as UserWithRoles[];

    if (candidates.length === 0) {
      // Don't leak whether the phone exists.
      return;
    }
    // MVP: OTP login assumes a phone maps to a single account (the
    // guardian first-time-login case the doc describes). If a phone is
    // reused across schools, OTP login isn't supported yet — password
    // login (which disambiguates by trying each candidate) still works.
    const user = candidates[0];

    const code = this.otp.generate(user.id);
    await this.smsGateway.send(
      user.schoolId,
      phone,
      `Your login code is ${code}`,
      'otp',
    );
  }

  async verifyOtp(phone: string, code: string): Promise<AuthTokens> {
    const candidates = (await this.prisma.user.findMany({
      where: { phone, isActive: true },
      include: { roles: true },
    })) as UserWithRoles[];

    if (candidates.length === 0) {
      throw new UnauthorizedException('Invalid code');
    }
    const user = candidates[0];

    if (!this.otp.verify(user.id, code)) {
      throw new UnauthorizedException('Invalid or expired code');
    }

    return this.issueTokensFor(user);
  }

  private async issueTokensFor(user: UserWithRoles): Promise<AuthTokens> {
    const roles = user.roles.map((r) => r.role);

    const accessPayload: JwtAccessPayload = {
      user_id: user.id.toString(),
      school_id: user.schoolId != null ? user.schoolId.toString() : null,
      roles,
      type: 'access',
    };
    const refreshPayload: JwtRefreshPayload = {
      user_id: user.id.toString(),
      type: 'refresh',
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwt.signAsync({ ...accessPayload }, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN'),
      } as JwtSignOptions),
      this.jwt.signAsync({ ...refreshPayload }, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN'),
      } as JwtSignOptions),
    ]);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { access_token, refresh_token, roles };
  }
}
