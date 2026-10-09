import { describe, it, expect, beforeAll } from 'vitest';
import { startPostgres, seedReview } from '../../test/pg';
import { ReportService } from './service';

describe('ReportService.generate', () => {
  beforeAll(async () => {
    await startPostgres();
    process.env.GITHUB_TOKEN = process.env.TEST_GITHUB_TOKEN;
  });

  it('buckets findings by confidence', async () => {
    const { prId } = await seedReview({ confidences: [0.9, 0.6, 0.2] });
    const report = await new ReportService().generate('ws-1', prId);
    expect(report?.buckets).toEqual({ high: 1, medium: 1, low: 1 });
  });
});
