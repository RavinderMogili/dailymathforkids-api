# Grade Lock and Practice Fairness Rollout

## Proposed cutover

Use **Monday, September 7, 2026 at 00:00 America/Moncton** as the clean weekly Math Stars boundary. Confirm the date immediately before deployment; do not deploy from this branch without owner approval.

## Schema and existing-data impact

Migration `002_grade_lock_practice_fairness.sql` is additive. It keeps `users.grade` as Official Grade; adds the one-time correction flag and audit; adds grade-at-award, canonical reward day, and idempotency fields; and backfills accounting dates only.

It does **not** update, delete, reset, transfer, or recalculate any `points_earned` value. Existing grades become Official Grades without rewriting them. Existing lifetime points remain grandfathered.

## Deployment order

1. Review the read-only historical fairness report.
2. Approve the cutover date and take a database backup.
3. Apply the migration.
4. Verify functions and indexes outside production.
5. Deploy the API and run smoke tests.
6. Deploy the frontend and verify the complete browser flow.
7. Monitor errors without changing historical points.

## Owner-only grade correction after lock

There is intentionally no public administrative endpoint. After approving a Feedback request, an owner uses an authenticated Supabase SQL Editor session:

```sql
select * from public.admin_change_official_grade(
  '<student-user-id>'::uuid,
  'Grade 5',
  'Approved Feedback request <reference>'
);
```

The function is executable only by `service_role`, requires a reason, preserves all points, and appends an audit row. Never put a service-role credential in frontend code.

## Rollback plan

Restore the prior frontend and API releases first. Leave additive audit and attribution columns in place. Disable new calls while investigating. Do not run a destructive down migration and do not delete or recalculate points. Any corrective data operation requires separate owner review and an audited script.

