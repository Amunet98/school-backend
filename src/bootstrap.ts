import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// BigInt IDs (BIGSERIAL) don't serialize with JSON.stringify by default.
// Every bigint in an API response is rendered as a string. Side effect,
// safe to import multiple times (main.ts and the e2e test bootstrap).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

/** Shared app configuration for both the real server and e2e tests. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());
}
