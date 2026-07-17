const { execSync } = require('child_process');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const FIXTURE_SCHOOL_NAMES = ['Sunrise Secondary School', 'Tenant Isolation Test School'];

// Runs once before the whole e2e suite. Deliberately does NOT use `prisma
// migrate reset` (or any other whole-database-wiping command) — instead it
// deletes only the rows that belong to THIS suite's own named fixture
// schools (in FK-safe order), then re-runs prisma/seed.ts to recreate them.
// That keeps re-runs deterministic without ever touching data outside the
// fixtures this test suite owns.
module.exports = async () => {
  const prisma = new PrismaClient();
  try {
    const schools = await prisma.school.findMany({
      where: { name: { in: FIXTURE_SCHOOL_NAMES } },
      select: { id: true },
    });
    const schoolIds = schools.map((s) => s.id);

    if (schoolIds.length > 0) {
      await prisma.$transaction([
        prisma.attendanceRecord.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.smsMessage.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.payment.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.invoice.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.feeStructure.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.notice.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.enrollment.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.studentGuardian.deleteMany({
          where: { student: { schoolId: { in: schoolIds } } },
        }),
        prisma.student.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.guardian.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.section.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.class.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.teacher.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.academicYear.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.userRoleAssignment.deleteMany({
          where: { user: { schoolId: { in: schoolIds } } },
        }),
        prisma.user.deleteMany({ where: { schoolId: { in: schoolIds } } }),
        prisma.school.deleteMany({ where: { id: { in: schoolIds } } }),
      ]);
    }
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx ts-node prisma/seed.ts', {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
    env: process.env,
  });
};
