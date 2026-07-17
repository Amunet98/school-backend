import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { SmsService } from './sms.service';

describe('SmsService', () => {
  let service: SmsService;
  let smsMessageCreate: jest.Mock;
  let executeRaw: jest.Mock;

  beforeEach(async () => {
    smsMessageCreate = jest.fn();
    executeRaw = jest.fn().mockResolvedValue(1);

    const tx = {
      smsMessage: { create: smsMessageCreate },
      $executeRaw: executeRaw,
    };

    const prismaMock = {
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get(SmsService);
  });

  it('inserts a queued sms_messages row and enqueues a send_sms job', async () => {
    smsMessageCreate.mockResolvedValue({
      id: 1n,
      schoolId: 10n,
      phone: '9800000002',
      body: 'test',
      purpose: 'otp',
      status: 'queued',
      dedupKey: null,
      gatewayRef: null,
      createdAt: new Date(),
    });

    const row = await service.enqueue({
      schoolId: 10n,
      phone: '9800000002',
      body: 'test',
      purpose: 'otp',
    });

    expect(row).not.toBeNull();
    expect(smsMessageCreate).toHaveBeenCalledWith({
      data: {
        schoolId: 10n,
        phone: '9800000002',
        body: 'test',
        purpose: 'otp',
        status: 'queued',
        dedupKey: null,
      },
    });
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('returns null and never enqueues a job when dedup_key collides (P2002)', async () => {
    smsMessageCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    const row = await service.enqueue({
      schoolId: 10n,
      phone: '9800000002',
      body: 'test',
      purpose: 'absence',
      dedupKey: 'absence:1:2083-04-02',
    });

    expect(row).toBeNull();
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('rethrows non-P2002 errors from the insert', async () => {
    smsMessageCreate.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.enqueue({
        schoolId: 10n,
        phone: '9800000002',
        body: 'test',
        purpose: 'otp',
      }),
    ).rejects.toThrow('connection lost');
    expect(executeRaw).not.toHaveBeenCalled();
  });
});
