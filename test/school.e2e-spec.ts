import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

const dbPrisma = new PrismaClient();

async function pollSmsSent(
  dedupKeyOrPhoneAndPurpose: {
    dedupKey?: string;
    phone?: string;
    purpose?: string;
  },
  timeoutMs = 8000,
): Promise<{ id: bigint; status: string; gatewayRef: string | null } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const row = dedupKeyOrPhoneAndPurpose.dedupKey
      ? await dbPrisma.smsMessage.findUnique({
          where: { dedupKey: dedupKeyOrPhoneAndPurpose.dedupKey },
        })
      : await dbPrisma.smsMessage.findFirst({
          where: {
            phone: dedupKeyOrPhoneAndPurpose.phone,
            purpose: dedupKeyOrPhoneAndPurpose.purpose,
          },
          orderBy: { createdAt: 'desc' },
        });
    if (row && row.status === 'sent') return row;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

const SCHOOL_A_ADMIN = { phone: '9800000001', password: 'Admin@12345' };
const SCHOOL_A_TEACHER_GUARDIAN = {
  phone: '9800000002',
  password: 'Teacher@12345',
};
const SCHOOL_B_ADMIN = { phone: '9800000099', password: 'Admin@12345' };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function currentMonth(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

describe('School Backend (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;

  let adminToken: string;
  let teacherToken: string; // same user also has the `guardian` role
  let schoolBAdminToken: string;

  let classId: string;
  let sectionAId: string;
  let sectionBId: string;
  let yearId: string;

  let createdStudentId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
    await dbPrisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    await request(server).get('/api/v1/classes').expect(401);
  });

  it('admin logs in', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send(SCHOOL_A_ADMIN)
      .expect(200);

    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
    expect(res.body.roles).toEqual(['school_admin']);
    adminToken = res.body.access_token;
  });

  it('rejects wrong password', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ phone: SCHOOL_A_ADMIN.phone, password: 'wrong-password' })
      .expect(401);
  });

  it('accepts login with a role param the account holds', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send({ ...SCHOOL_A_ADMIN, role: 'school_admin' })
      .expect(200);
    expect(res.body.roles).toEqual(['school_admin']);
  });

  it('rejects login with a role param the account does not hold (403, not 401)', async () => {
    await request(server)
      .post('/api/v1/auth/login')
      .send({ ...SCHOOL_A_ADMIN, role: 'guardian' })
      .expect(403);
  });

  it('admin discovers the seeded class/section/academic-year ids', async () => {
    const classesRes = await request(server)
      .get('/api/v1/classes')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const class7 = classesRes.body.find((c: any) => c.name === 'Class 7');
    expect(class7).toBeDefined();
    classId = class7.id;

    const sectionsRes = await request(server)
      .get('/api/v1/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const sectionA = sectionsRes.body.find(
      (s: any) => s.name === 'A' && s.classId === classId,
    );
    const sectionB = sectionsRes.body.find(
      (s: any) => s.name === 'B' && s.classId === classId,
    );
    expect(sectionA).toBeDefined();
    expect(sectionB).toBeDefined();
    sectionAId = sectionA.id;
    sectionBId = sectionB.id;

    const yearsRes = await request(server)
      .get('/api/v1/academic-years')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const currentYear = yearsRes.body.find((y: any) => y.isCurrent);
    expect(currentYear).toBeDefined();
    yearId = currentYear.id;
  });

  it('admin creates a student with a guardian and an enrollment', async () => {
    const res = await request(server)
      .post('/api/v1/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Newly Admitted Student',
        gender: 'male',
        guardians: [
          {
            full_name: 'New Guardian',
            phone: '9822220001',
            relation: 'father',
          },
        ],
        enrollment: {
          academic_year_id: Number(yearId),
          section_id: Number(sectionAId),
          roll_no: 50,
        },
      })
      .expect(201);

    expect(res.body.fullName).toBe('Newly Admitted Student');
    expect(res.body.guardians).toHaveLength(1);
    expect(res.body.enrollments).toHaveLength(1);
    createdStudentId = res.body.id;
  });

  it('admin imports students via CSV, with a per-row error report', async () => {
    const csv = [
      'full_name,dob,gender,class_name,section_name,roll_no,guardian_full_name,guardian_phone,guardian_relation',
      'CSV Student A,2013-01-01,male,Class 7,A,90,CSV Guardian A,9833330001,father',
      'CSV Student B,2013-02-02,female,Class 7,B,91,CSV Guardian B,9833330002,mother',
      'Bad Row,,,,,,,,',
    ].join('\n');

    const res = await request(server)
      .post(`/api/v1/students/import?academic_year_id=${yearId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from(csv), 'students.csv')
      .expect(201);

    expect(res.body.created).toBe(2);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].row).toBe(4);
  });

  it('teacher (also a guardian) logs in', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send(SCHOOL_A_TEACHER_GUARDIAN)
      .expect(200);

    expect(res.body.roles.sort()).toEqual(['guardian', 'teacher']);
    teacherToken = res.body.access_token;
  });

  it('teacher sees their own section in /my/sections', async () => {
    const res = await request(server)
      .get('/api/v1/my/sections')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(res.body.some((s: any) => s.id === sectionAId)).toBe(true);
  });

  it('admin (not a teacher) is forbidden from teacher-only routes', async () => {
    await request(server)
      .get('/api/v1/my/sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });

  let aaravEnrollmentId: string;
  let otherEnrollmentId: string;

  it('teacher lists section A students for today, including newly enrolled ones', async () => {
    const res = await request(server)
      .get(`/api/v1/sections/${sectionAId}/students`)
      .query({ date: todayIso() })
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    expect(res.body.date_bs).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const aarav = res.body.students.find(
      (s: any) => s.full_name === 'Aarav Sharma',
    );
    expect(aarav).toBeDefined();
    aaravEnrollmentId = aarav.enrollment_id;

    const newlyAdmitted = res.body.students.find(
      (s: any) => s.full_name === 'Newly Admitted Student',
    );
    expect(newlyAdmitted).toBeDefined();
    otherEnrollmentId = newlyAdmitted.enrollment_id;

    const csvStudent = res.body.students.find(
      (s: any) => s.full_name === 'CSV Student A',
    );
    expect(csvStudent).toBeDefined();

    // All fresh, no attendance marked yet.
    expect(aarav.status).toBeNull();
  });

  it('teacher marks attendance for section A (bulk upsert)', async () => {
    const res = await request(server)
      .post(`/api/v1/sections/${sectionAId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        date: todayIso(),
        records: [
          { enrollment_id: Number(aaravEnrollmentId), status: 'present' },
          { enrollment_id: Number(otherEnrollmentId), status: 'absent' },
        ],
      })
      .expect(201);

    const aarav = res.body.students.find(
      (s: any) => s.enrollment_id === aaravEnrollmentId,
    );
    const other = res.body.students.find(
      (s: any) => s.enrollment_id === otherEnrollmentId,
    );
    expect(aarav.status).toBe('present');
    expect(other.status).toBe('absent');
  });

  it('rejects marking attendance for an enrollment outside the section', async () => {
    // sectionBId has different students; Aarav's enrollment belongs to section A.
    await request(server)
      .post(`/api/v1/sections/${sectionBId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        date: todayIso(),
        records: [
          { enrollment_id: Number(aaravEnrollmentId), status: 'present' },
        ],
      })
      .expect(403); // teacher isn't class_teacher of section B at all
  });

  it('re-submitting attendance for the same date corrects it (upsert, no duplicates)', async () => {
    const res = await request(server)
      .post(`/api/v1/sections/${sectionAId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        date: todayIso(),
        records: [{ enrollment_id: Number(aaravEnrollmentId), status: 'late' }],
      })
      .expect(201);

    const aarav = res.body.students.find(
      (s: any) => s.enrollment_id === aaravEnrollmentId,
    );
    expect(aarav.status).toBe('late');

    // Fetching again should still show exactly one status per student for the date.
    const fetchRes = await request(server)
      .get(`/api/v1/sections/${sectionAId}/students`)
      .query({ date: todayIso() })
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);
    const matches = fetchRes.body.students.filter(
      (s: any) => s.enrollment_id === aaravEnrollmentId,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('late');
  });

  it('guardian fetches their child month attendance, including date_bs', async () => {
    const childrenRes = await request(server)
      .get('/api/v1/my/children')
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const aarav = childrenRes.body.find(
      (c: any) => c.full_name === 'Aarav Sharma',
    );
    expect(aarav).toBeDefined();

    const attendanceRes = await request(server)
      .get(`/api/v1/children/${aarav.student_id}/attendance`)
      .query({ month: currentMonth() })
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const todayRecord = attendanceRes.body.find(
      (r: any) => r.date === todayIso(),
    );
    expect(todayRecord).toBeDefined();
    expect(todayRecord.status).toBe('late');
    expect(todayRecord.date_bs).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('school B admin logs in and only ever sees school B data', async () => {
    const res = await request(server)
      .post('/api/v1/auth/login')
      .send(SCHOOL_B_ADMIN)
      .expect(200);
    schoolBAdminToken = res.body.access_token;

    const studentsRes = await request(server)
      .get('/api/v1/students')
      .set('Authorization', `Bearer ${schoolBAdminToken}`)
      .expect(200);

    expect(studentsRes.body.length).toBeGreaterThan(0);
    const schoolBId = studentsRes.body[0].schoolId;
    for (const student of studentsRes.body) {
      expect(student.schoolId).toBe(schoolBId);
    }
    expect(studentsRes.body.some((s: any) => s.id === createdStudentId)).toBe(
      false,
    );
  });

  it('school B admin cannot read a school A student directly by id (tenant isolation)', async () => {
    await request(server)
      .get(`/api/v1/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${schoolBAdminToken}`)
      .expect(404);
  });

  it('school B admin cannot mark attendance in a school A section', async () => {
    await request(server)
      .post(`/api/v1/sections/${sectionAId}/attendance`)
      .set('Authorization', `Bearer ${schoolBAdminToken}`)
      .send({
        date: todayIso(),
        records: [
          { enrollment_id: Number(aaravEnrollmentId), status: 'present' },
        ],
      })
      .expect(403); // school_admin role isn't `teacher` at all
  });

  describe('SMS milestone: absence alerts + OTP through the queue', () => {
    let absentEnrollmentId1: string;
    let absentEnrollmentId2: string;
    let lateOnlyEnrollmentId: string;
    let dedupKey1: string;
    let dedupKey2: string;
    let dedupKeyLate: string;

    async function admitSectionAStudent(
      fullName: string,
      guardianPhone: string,
      rollNo: number,
    ): Promise<string> {
      const res = await request(server)
        .post('/api/v1/students')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          full_name: fullName,
          gender: 'male',
          guardians: [
            {
              full_name: `${fullName} Guardian`,
              phone: guardianPhone,
              relation: 'father',
              is_primary: true,
            },
          ],
          enrollment: {
            academic_year_id: Number(yearId),
            section_id: Number(sectionAId),
            roll_no: rollNo,
          },
        })
        .expect(201);
      return res.body.enrollments[0].id as string;
    }

    it('admits three fresh section A students for the SMS tests', async () => {
      absentEnrollmentId1 = await admitSectionAStudent(
        'SMS Test Absent One',
        '9844440001',
        60,
      );
      absentEnrollmentId2 = await admitSectionAStudent(
        'SMS Test Absent Two',
        '9844440002',
        61,
      );
      lateOnlyEnrollmentId = await admitSectionAStudent(
        'SMS Test Late Only',
        '9844440003',
        62,
      );

      const today = todayIso();
      dedupKey1 = `absence:${absentEnrollmentId1}:${today}`;
      dedupKey2 = `absence:${absentEnrollmentId2}:${today}`;
      dedupKeyLate = `absence:${lateOnlyEnrollmentId}:${today}`;
    });

    it('marking 2 absent + 1 late creates exactly 2 absence sms_messages rows, both reaching sent', async () => {
      await request(server)
        .post(`/api/v1/sections/${sectionAId}/attendance`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          date: todayIso(),
          records: [
            { enrollment_id: Number(absentEnrollmentId1), status: 'absent' },
            { enrollment_id: Number(absentEnrollmentId2), status: 'absent' },
            { enrollment_id: Number(lateOnlyEnrollmentId), status: 'late' },
          ],
        })
        .expect(201);

      const sent1 = await pollSmsSent({ dedupKey: dedupKey1 });
      const sent2 = await pollSmsSent({ dedupKey: dedupKey2 });
      expect(sent1).not.toBeNull();
      expect(sent2).not.toBeNull();
      expect(sent1?.status).toBe('sent');
      expect(sent2?.status).toBe('sent');

      // late-only enrollment: no sms_messages row at all (not just "not sent").
      const lateRow = await dbPrisma.smsMessage.findUnique({
        where: { dedupKey: dedupKeyLate },
      });
      expect(lateRow).toBeNull();

      const absenceRows = await dbPrisma.smsMessage.findMany({
        where: { dedupKey: { in: [dedupKey1, dedupKey2] } },
      });
      expect(absenceRows).toHaveLength(2);
    });

    it('re-posting the same absent attendance does not create duplicate sms_messages rows', async () => {
      await request(server)
        .post(`/api/v1/sections/${sectionAId}/attendance`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          date: todayIso(),
          records: [
            { enrollment_id: Number(absentEnrollmentId1), status: 'absent' },
            { enrollment_id: Number(absentEnrollmentId2), status: 'absent' },
          ],
        })
        .expect(201);

      // Give the (no-op) enqueue attempt a moment, then assert the count
      // is still exactly 2 — the dedup_key unique index rejects the
      // second insert for each enrollment.
      await new Promise((resolve) => setTimeout(resolve, 500));
      const absenceRows = await dbPrisma.smsMessage.findMany({
        where: { dedupKey: { in: [dedupKey1, dedupKey2] } },
      });
      expect(absenceRows).toHaveLength(2);
    });

    it('a school with settings.sms_enabled=false gets no absence SMS (restored after)', async () => {
      const school = await dbPrisma.school.findFirstOrThrow({
        where: { name: 'Sunrise Secondary School' },
      });
      const originalSettings = school.settings;

      try {
        await dbPrisma.school.update({
          where: { id: school.id },
          data: { settings: { sms_enabled: false } },
        });

        const toggledEnrollmentId = await admitSectionAStudent(
          'SMS Test Toggled Off',
          '9844440004',
          63,
        );
        const dedupKeyToggled = `absence:${toggledEnrollmentId}:${todayIso()}`;

        await request(server)
          .post(`/api/v1/sections/${sectionAId}/attendance`)
          .set('Authorization', `Bearer ${teacherToken}`)
          .send({
            date: todayIso(),
            records: [
              { enrollment_id: Number(toggledEnrollmentId), status: 'absent' },
            ],
          })
          .expect(201);

        await new Promise((resolve) => setTimeout(resolve, 500));
        const row = await dbPrisma.smsMessage.findUnique({
          where: { dedupKey: dedupKeyToggled },
        });
        expect(row).toBeNull();
      } finally {
        await dbPrisma.school.update({
          where: { id: school.id },
          data: { settings: originalSettings ?? {} },
        });
      }
    });

    it('OTP request routes through the queue and reaches sent', async () => {
      await request(server)
        .post('/api/v1/auth/otp/request')
        .send({ phone: SCHOOL_A_TEACHER_GUARDIAN.phone })
        .expect(200);

      const otpRow = await pollSmsSent({
        phone: SCHOOL_A_TEACHER_GUARDIAN.phone,
        purpose: 'otp',
      });
      expect(otpRow).not.toBeNull();
      expect(otpRow?.status).toBe('sent');
    });

    it('OTP verify rejects a role the account does not hold, then a fresh code succeeds for a role it does hold', async () => {
      // Role check runs after the code is proven valid, which consumes it —
      // each attempt below needs its own fresh request/poll/extract round.
      async function requestAndExtractCode(): Promise<string> {
        await request(server)
          .post('/api/v1/auth/otp/request')
          .send({ phone: SCHOOL_A_TEACHER_GUARDIAN.phone })
          .expect(200);
        const otpRow = await pollSmsSent({
          phone: SCHOOL_A_TEACHER_GUARDIAN.phone,
          purpose: 'otp',
        });
        const full = await dbPrisma.smsMessage.findUniqueOrThrow({
          where: { id: otpRow!.id },
        });
        const match = full.body.match(/\d{6}/);
        expect(match).not.toBeNull();
        return match![0];
      }

      const mismatchCode = await requestAndExtractCode();
      await request(server)
        .post('/api/v1/auth/otp/verify')
        .send({
          phone: SCHOOL_A_TEACHER_GUARDIAN.phone,
          code: mismatchCode,
          role: 'school_admin',
        })
        .expect(403);

      const matchCode = await requestAndExtractCode();
      const res = await request(server)
        .post('/api/v1/auth/otp/verify')
        .send({
          phone: SCHOOL_A_TEACHER_GUARDIAN.phone,
          code: matchCode,
          role: 'guardian',
        })
        .expect(200);
      expect(res.body.roles.sort()).toEqual(['guardian', 'teacher']);
    });
  });

  describe('Notices milestone', () => {
    // Aarav Sharma (the teacher-guardian's own child, section A) is
    // primary-guardianed by the teacher-guardian account itself — a known,
    // always-present seeded phone to assert a single dedup key against
    // without depending on how many other students earlier tests admitted.
    const AARAV_GUARDIAN_PHONE = SCHOOL_A_TEACHER_GUARDIAN.phone;

    let schoolWideNoticeId: string;
    let classWideNoticeId: string;
    let sectionBNoticeId: string;
    let siblingNoticeId: string;
    const siblingGuardianPhone = '9855550099';

    it('rejects a stray class_id when audience is not "class"', async () => {
      await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Stray class id',
          body: 'body',
          audience: 'school',
          class_id: Number(classId),
        })
        .expect(400);
    });

    it('rejects a stray section_id when audience is not "section"', async () => {
      await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Stray section id',
          body: 'body',
          audience: 'class',
          class_id: Number(classId),
          section_id: Number(sectionAId),
        })
        .expect(400);
    });

    it('rejects audience="class" with no class_id', async () => {
      await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Missing class id', body: 'body', audience: 'class' })
        .expect(400);
    });

    it('rejects audience="section" with no section_id', async () => {
      await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Missing section id',
          body: 'body',
          audience: 'section',
        })
        .expect(400);
    });

    it('admin posts a school-wide notice with send_sms, guardian SMS reaches sent', async () => {
      const res = await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'School closed tomorrow',
          body: 'School will remain closed tomorrow for Dashain.',
          audience: 'school',
          send_sms: true,
        })
        .expect(201);

      expect(res.body.audience).toBe('school');
      schoolWideNoticeId = res.body.id;

      const dedupKey = `notice:${schoolWideNoticeId}:${AARAV_GUARDIAN_PHONE}`;
      const sent = await pollSmsSent({ dedupKey });
      expect(sent).not.toBeNull();
      expect(sent?.status).toBe('sent');
    });

    it('GET /notices (admin) lists the school-wide notice, unpaginated', async () => {
      const res = await request(server)
        .get('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const notice = res.body.find((n: any) => n.id === schoolWideNoticeId);
      expect(notice).toBeDefined();
      expect(notice.audience).toBe('school');
    });

    it('admin posts a class-wide notice with send_sms:false — no sms rows created', async () => {
      const res = await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Class 7 test schedule',
          body: 'Unit test next week.',
          audience: 'class',
          class_id: Number(classId),
          send_sms: false,
        })
        .expect(201);

      classWideNoticeId = res.body.id;

      await new Promise((resolve) => setTimeout(resolve, 300));
      const rows = await dbPrisma.smsMessage.findMany({
        where: { dedupKey: { startsWith: `notice:${classWideNoticeId}:` } },
      });
      expect(rows).toHaveLength(0);
    });

    it('admin posts a section-B-only notice (not visible to the section-A teacher)', async () => {
      const res = await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Section B only',
          body: 'Only for section B.',
          audience: 'section',
          section_id: Number(sectionBId),
        })
        .expect(201);
      sectionBNoticeId = res.body.id;
    });

    it('two siblings sharing a guardian phone get exactly one notice SMS (dedup)', async () => {
      async function admitSiblingIntoSectionA(fullName: string): Promise<void> {
        await request(server)
          .post('/api/v1/students')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            full_name: fullName,
            gender: 'male',
            guardians: [
              {
                full_name: 'Shared Guardian',
                phone: siblingGuardianPhone,
                relation: 'father',
                is_primary: true,
              },
            ],
            enrollment: {
              academic_year_id: Number(yearId),
              section_id: Number(sectionAId),
              roll_no: 80,
            },
          })
          .expect(201);
      }

      await admitSiblingIntoSectionA('Sibling One');
      await admitSiblingIntoSectionA('Sibling Two');

      const res = await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Section A sibling dedup test',
          body: 'body',
          audience: 'section',
          section_id: Number(sectionAId),
          send_sms: true,
        })
        .expect(201);
      siblingNoticeId = res.body.id;

      const dedupKey = `notice:${siblingNoticeId}:${siblingGuardianPhone}`;
      const sent = await pollSmsSent({ dedupKey });
      expect(sent).not.toBeNull();

      const rows = await dbPrisma.smsMessage.count({
        where: {
          dedupKey: {
            startsWith: `notice:${siblingNoticeId}:${siblingGuardianPhone}`,
          },
        },
      });
      expect(rows).toBe(1);
    });

    it('teacher sees school-wide + own-class + own-section notices, not section-B', async () => {
      const res = await request(server)
        .get('/api/v1/my/notices')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);

      const ids = res.body.map((n: any) => n.id);
      expect(ids).toContain(schoolWideNoticeId);
      expect(ids).toContain(classWideNoticeId);
      expect(ids).toContain(siblingNoticeId);
      expect(ids).not.toContain(sectionBNoticeId);
    });

    it('admin (not a teacher) is forbidden from GET /my/notices', async () => {
      await request(server)
        .get('/api/v1/my/notices')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('teacher (not an admin) is forbidden from the admin notices routes', async () => {
      await request(server)
        .get('/api/v1/notices')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(403);
    });

    it('teacher posts a notice to their own section: 201', async () => {
      const res = await request(server)
        .post('/api/v1/my/notices')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          title: 'Homework reminder',
          body: 'Please complete the homework by Friday.',
          section_id: Number(sectionAId),
        })
        .expect(201);

      expect(res.body.audience).toBe('section');
      expect(res.body.sectionId).toBe(sectionAId);
    });

    it('teacher posting to section B (not their own): 403', async () => {
      await request(server)
        .post('/api/v1/my/notices')
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          title: 'Not my section',
          body: 'body',
          section_id: Number(sectionBId),
        })
        .expect(403);
    });

    it("school B admin only sees school B notices, none of school A's", async () => {
      const res = await request(server)
        .get('/api/v1/notices')
        .set('Authorization', `Bearer ${schoolBAdminToken}`)
        .expect(200);

      const ids = res.body.map((n: any) => n.id);
      expect(ids).not.toContain(schoolWideNoticeId);
      expect(ids).not.toContain(classWideNoticeId);
      expect(ids).not.toContain(sectionBNoticeId);
      expect(ids).not.toContain(siblingNoticeId);
    });

    it('school B admin targeting a school A section_id: 404 (tenant isolation)', async () => {
      await request(server)
        .post('/api/v1/notices')
        .set('Authorization', `Bearer ${schoolBAdminToken}`)
        .send({
          title: 'Cross-school attempt',
          body: 'body',
          audience: 'section',
          section_id: Number(sectionAId),
        })
        .expect(404);
    });
  });
});
