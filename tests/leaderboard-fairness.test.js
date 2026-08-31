import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { buildGradeLeaderboard } from '../api/leaderboard.js';

describe('grade-at-award leaderboard fairness', () => {
  const users = [
    { id: 'u1', nickname: 'MovedGrade', grade: 'Grade 5', school: 'A', city: 'Moncton' },
    { id: 'u2', nickname: 'GradeFour', grade: 'Grade 4', school: 'B', city: 'Moncton' },
  ];

  it('does not move previously attributed competitive points into a corrected grade', () => {
    const quizRows = [
      { user_id: 'u1', points_earned: 8, reward_day: '2026-09-07', official_grade_at_submission: 'Grade 4' },
      { user_id: 'u1', points_earned: 5, reward_day: '2026-09-08', official_grade_at_submission: 'Grade 5' },
    ];
    const practiceRows = [
      { user_id: 'u1', points_earned: 2.5, reward_day: '2026-09-07', official_grade_at_award: 'Grade 4', reward_eligible: true },
    ];

    expect(buildGradeLeaderboard(users, quizRows, practiceRows, 'Grade 4')).toEqual([
      expect.objectContaining({ nickname: 'MovedGrade', grade: 'Grade 4', total_points: 10.5 }),
    ]);
    expect(buildGradeLeaderboard(users, quizRows, practiceRows, 'Grade 5')).toEqual([
      expect.objectContaining({ nickname: 'MovedGrade', grade: 'Grade 5', total_points: 5 }),
    ]);
  });

  it('keeps unattributed historical points out of new grade-specific competition', () => {
    const historical = [{ user_id: 'u1', points_earned: 140, reward_day: '2026-08-31', official_grade_at_submission: null }];
    expect(buildGradeLeaderboard(users, historical, [], 'Grade 4')).toEqual([]);
    expect(buildGradeLeaderboard(users, historical, [], 'Grade 5')).toEqual([]);
  });

  it('excludes cross-grade Practice even if a malformed row carries points', () => {
    const crossGrade = [{ user_id: 'u1', points_earned: 10, reward_day: '2026-09-07',
      official_grade_at_award: 'Grade 5', reward_eligible: false }];
    expect(buildGradeLeaderboard(users, [], crossGrade, 'Grade 5')).toEqual([]);
  });

  it('ranks ties consistently and keeps all rows tied at the limit', () => {
    const rows = [
      { user_id: 'u1', points_earned: 5, reward_day: '2026-09-07', official_grade_at_submission: 'Grade 4' },
      { user_id: 'u2', points_earned: 5, reward_day: '2026-09-07', official_grade_at_submission: 'Grade 4' },
    ];
    const result = buildGradeLeaderboard(users, rows, [], 'Grade 4', 1);
    expect(result).toHaveLength(2);
    expect(result.every(row => row.rank === 1)).toBe(true);
  });
});

describe('schema reference stays aligned with the fairness migration', () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(process.cwd(), 'migrations', '002_grade_lock_practice_fairness.sql'), 'utf8');
  const requiredNames = [
    'grade_correction_used', 'official_grade_changes', 'submission_key',
    'practice_grade', 'official_grade_at_award', 'reward_eligible', 'reward_day',
    'official_grade_at_submission', 'correct_official_grade',
    'admin_change_official_grade', 'award_practice_submission',
    'practice_submissions_grade_user_idx', 'submissions_grade_user_idx',
  ];

  it.each(requiredNames)('contains %s in both schema sources', name => {
    expect(schema).toContain(name);
    expect(migration).toContain(name);
  });

  it('keeps the lifetime view while documenting grade-at-award competition', () => {
    expect(schema).toContain('create or replace view leaderboard');
    expect(schema).toMatch(/Grade-filtered competitive API results use[\s\S]*grade-at-award/i);
  });
});

