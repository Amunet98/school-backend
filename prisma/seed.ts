import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

// Fixed, documented seed credentials (see CLAUDE.md / README).
const PASSWORDS = {
  schoolAdminA: 'Admin@12345',
  teacherGuardianA: 'Teacher@12345',
  schoolAdminB: 'Admin@12345',
};

const FIRST_NAMES = [
  'Aarav', 'Anish', 'Bibek', 'Bishal', 'Diya', 'Grishma', 'Hari', 'Ishani',
  'Kabin', 'Kritika', 'Manish', 'Nisha', 'Prashant', 'Rojina', 'Sabin',
];
const LAST_NAMES = ['Sharma', 'Thapa', 'Gurung', 'Shrestha', 'Karki', 'Rai'];

async function hash(password: string) {
  return argon2.hash(password);
}

async function main() {
  console.log('Seeding School A (Sunrise Secondary School)...');

  const schoolA = await prisma.school.create({
    data: {
      name: 'Sunrise Secondary School',
      address: 'Kathmandu, Nepal',
      phone: '01-4000000',
      isActive: true,
    },
  });

  const yearA = await prisma.academicYear.create({
    data: {
      schoolId: schoolA.id,
      name: '2083',
      startDate: new Date('2026-04-13'),
      endDate: new Date('2027-04-12'),
      isCurrent: true,
    },
  });

  // --- school_admin ---
  const adminUser = await prisma.user.create({
    data: {
      schoolId: schoolA.id,
      phone: '9800000001',
      passwordHash: await hash(PASSWORDS.schoolAdminA),
      roles: { create: [{ role: 'school_admin' }] },
    },
  });
  console.log(`  school_admin: phone=${adminUser.phone} password=${PASSWORDS.schoolAdminA}`);

  // --- teacher who is ALSO a guardian: one user, two roles ---
  const teacherGuardianUser = await prisma.user.create({
    data: {
      schoolId: schoolA.id,
      phone: '9800000002',
      passwordHash: await hash(PASSWORDS.teacherGuardianA),
      roles: { create: [{ role: 'teacher' }, { role: 'guardian' }] },
    },
  });
  console.log(
    `  teacher+guardian: phone=${teacherGuardianUser.phone} password=${PASSWORDS.teacherGuardianA}`,
  );

  const teacher = await prisma.teacher.create({
    data: {
      schoolId: schoolA.id,
      userId: teacherGuardianUser.id,
      fullName: 'Suresh Sharma',
      phone: teacherGuardianUser.phone,
    },
  });

  const teacherAsGuardian = await prisma.guardian.create({
    data: {
      schoolId: schoolA.id,
      userId: teacherGuardianUser.id,
      fullName: 'Suresh Sharma',
      phone: teacherGuardianUser.phone,
      relation: 'father',
    },
  });

  // --- Class 7, sections A and B ---
  const class7 = await prisma.class.create({
    data: { schoolId: schoolA.id, name: 'Class 7', sortOrder: 7 },
  });

  const sectionA = await prisma.section.create({
    data: {
      schoolId: schoolA.id,
      classId: class7.id,
      name: 'A',
      classTeacherId: teacher.id,
    },
  });

  const sectionB = await prisma.section.create({
    data: { schoolId: schoolA.id, classId: class7.id, name: 'B' },
  });

  // --- ~15 students with guardians + enrollments ---
  let rollA = 1;
  let rollB = 1;
  for (let i = 0; i < FIRST_NAMES.length; i++) {
    const fullName = `${FIRST_NAMES[i]} ${LAST_NAMES[i % LAST_NAMES.length]}`;
    const section = i % 2 === 0 ? sectionA : sectionB;

    const student = await prisma.student.create({
      data: {
        schoolId: schoolA.id,
        fullName,
        dob: new Date(`2013-0${(i % 9) + 1}-15`),
        gender: i % 2 === 0 ? 'male' : 'female',
      },
    });

    if (i === 0) {
      // The teacher-guardian's own child, so the seeded teacher/guardian
      // account can be used end-to-end (mark attendance as teacher, then
      // read the same child's attendance as guardian).
      await prisma.studentGuardian.create({
        data: { studentId: student.id, guardianId: teacherAsGuardian.id, isPrimary: true },
      });
    } else {
      const guardian = await prisma.guardian.create({
        data: {
          schoolId: schoolA.id,
          fullName: `${LAST_NAMES[(i + 2) % LAST_NAMES.length]} Guardian`,
          phone: `98010000${String(i).padStart(2, '0')}`,
          relation: i % 2 === 0 ? 'father' : 'mother',
        },
      });
      await prisma.studentGuardian.create({
        data: { studentId: student.id, guardianId: guardian.id, isPrimary: true },
      });
    }

    await prisma.enrollment.create({
      data: {
        schoolId: schoolA.id,
        studentId: student.id,
        academicYearId: yearA.id,
        sectionId: section.id,
        rollNo: section.id === sectionA.id ? rollA++ : rollB++,
      },
    });
  }
  console.log(`  ${FIRST_NAMES.length} students created (sections A/B, Class 7)`);

  // --- second minimal school, for tenant-isolation e2e test ---
  console.log('Seeding School B (Tenant Isolation Test School)...');

  const schoolB = await prisma.school.create({
    data: { name: 'Tenant Isolation Test School', isActive: true },
  });

  const yearB = await prisma.academicYear.create({
    data: {
      schoolId: schoolB.id,
      name: '2083',
      startDate: new Date('2026-04-13'),
      endDate: new Date('2027-04-12'),
      isCurrent: true,
    },
  });

  const adminB = await prisma.user.create({
    data: {
      schoolId: schoolB.id,
      phone: '9800000099',
      passwordHash: await hash(PASSWORDS.schoolAdminB),
      roles: { create: [{ role: 'school_admin' }] },
    },
  });
  console.log(`  school_admin: phone=${adminB.phone} password=${PASSWORDS.schoolAdminB}`);

  const classB = await prisma.class.create({
    data: { schoolId: schoolB.id, name: 'Class 1', sortOrder: 1 },
  });
  const sectionBB = await prisma.section.create({
    data: { schoolId: schoolB.id, classId: classB.id, name: 'A' },
  });
  const studentB = await prisma.student.create({
    data: { schoolId: schoolB.id, fullName: 'Isolated Student' },
  });
  await prisma.enrollment.create({
    data: {
      schoolId: schoolB.id,
      studentId: studentB.id,
      academicYearId: yearB.id,
      sectionId: sectionBB.id,
      rollNo: 1,
    },
  });

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
