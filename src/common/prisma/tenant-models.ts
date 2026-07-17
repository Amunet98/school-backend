/**
 * Prisma model names (as they appear in `prisma.$extends` query hooks) that
 * carry a `school_id` column and therefore must always be scoped to the
 * caller's school. `School` itself is excluded — it IS the tenant.
 */
export const TENANT_MODELS = new Set([
  'AcademicYear',
  'User',
  'Teacher',
  'Class',
  'Section',
  'Student',
  'Guardian',
  'Enrollment',
  'AttendanceRecord',
  'Notice',
  'FeeStructure',
  'Invoice',
  'Payment',
  'SmsMessage',
]);

/** Operations whose `where` clause we safely merge a school_id filter into. */
export const SCOPED_READ_WRITE_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);
