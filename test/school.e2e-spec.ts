import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

const SCHOOL_A_ADMIN = { phone: '9800000001', password: 'Admin@12345' };
const SCHOOL_A_TEACHER_GUARDIAN = { phone: '9800000002', password: 'Teacher@12345' };
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
    const sectionA = sectionsRes.body.find((s: any) => s.name === 'A' && s.classId === classId);
    const sectionB = sectionsRes.body.find((s: any) => s.name === 'B' && s.classId === classId);
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
        guardians: [{ full_name: 'New Guardian', phone: '9822220001', relation: 'father' }],
        enrollment: { academic_year_id: Number(yearId), section_id: Number(sectionAId), roll_no: 50 },
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

    const aarav = res.body.students.find((s: any) => s.full_name === 'Aarav Sharma');
    expect(aarav).toBeDefined();
    aaravEnrollmentId = aarav.enrollment_id;

    const newlyAdmitted = res.body.students.find(
      (s: any) => s.full_name === 'Newly Admitted Student',
    );
    expect(newlyAdmitted).toBeDefined();
    otherEnrollmentId = newlyAdmitted.enrollment_id;

    const csvStudent = res.body.students.find((s: any) => s.full_name === 'CSV Student A');
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

    const aarav = res.body.students.find((s: any) => s.enrollment_id === aaravEnrollmentId);
    const other = res.body.students.find((s: any) => s.enrollment_id === otherEnrollmentId);
    expect(aarav.status).toBe('present');
    expect(other.status).toBe('absent');
  });

  it('rejects marking attendance for an enrollment outside the section', async () => {
    // sectionBId has different students; Aarav's enrollment belongs to section A.
    await request(server)
      .post(`/api/v1/sections/${sectionBId}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ date: todayIso(), records: [{ enrollment_id: Number(aaravEnrollmentId), status: 'present' }] })
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

    const aarav = res.body.students.find((s: any) => s.enrollment_id === aaravEnrollmentId);
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

    const aarav = childrenRes.body.find((c: any) => c.full_name === 'Aarav Sharma');
    expect(aarav).toBeDefined();

    const attendanceRes = await request(server)
      .get(`/api/v1/children/${aarav.student_id}/attendance`)
      .query({ month: currentMonth() })
      .set('Authorization', `Bearer ${teacherToken}`)
      .expect(200);

    const todayRecord = attendanceRes.body.find((r: any) => r.date === todayIso());
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
    expect(studentsRes.body.some((s: any) => s.id === createdStudentId)).toBe(false);
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
      .send({ date: todayIso(), records: [{ enrollment_id: Number(aaravEnrollmentId), status: 'present' }] })
      .expect(403); // school_admin role isn't `teacher` at all
  });
});
