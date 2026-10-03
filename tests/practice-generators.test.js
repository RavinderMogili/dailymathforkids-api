/**
 * Unit tests for api/_practice-generators.js — specifically the server-side
 * pool selection logic (grade/topic/difficulty filtering and metadata
 * preservation). The algorithmic generator portion is the same huge ported
 * function block tested in the frontend repo; this file focuses on the
 * server-only pool handling that is NOT covered by that cross-repo sync check.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const POOL_FIXTURE = JSON.stringify([
  {
    grade: 4, topic: 'Word Problems', question: 'easy word problem', questionFr: '',
    choices: ['1', '2', '3', '4'], answer: 1, hint: 'h', steps: ['s'],
    _source: 'gsm8k', _sourceId: 'gsm8k-easy-1', _sourceTopic: 'Money', _difficulty: 'easy',
  },
  {
    grade: 4, topic: 'Word Problems', question: 'hard word problem', questionFr: '',
    choices: ['10', '20', '30', '40'], answer: 20, hint: 'h', steps: ['s'],
    _source: 'gsm8k', _sourceId: 'gsm8k-hard-1', _sourceTopic: 'Money', _difficulty: 'hard',
  },
  {
    grade: 5, topic: 'Word Problems', question: 'grade 5 medium', questionFr: '',
    choices: ['5', '6', '7', '8'], answer: 6, hint: 'h', steps: ['s'],
    _source: 'gsm8k', _sourceId: 'gsm8k-g5m-1', _sourceTopic: 'Time', _difficulty: 'medium',
  },
]);

const EMPTY_POOL = JSON.stringify([]);

const mockReadFileSync = jest.fn((filename) => {
  if (filename.includes('practice-pool-extended.json')) return POOL_FIXTURE;
  return EMPTY_POOL;
});

jest.unstable_mockModule('fs', () => ({
  readFileSync: mockReadFileSync,
}));

describe('generatePracticeQuestions pool selection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXTENDED_POOL_ENABLED = 'true';
  });

  it('filters Word Problems by selected difficulty (easy)', async () => {
    const { generatePracticeQuestions } = await import('../api/_practice-generators.js');
    const questions = generatePracticeQuestions(4, ['Word Problems'], 'easy', 1);
    expect(questions.length).toBe(1);
    expect(questions[0]._sourceId).toBe('gsm8k-easy-1');
    expect(questions[0]._difficulty).toBe('easy');
    expect(questions[0]._sourceTopic).toBe('Money');
  });

  it('filters Word Problems by selected difficulty (hard)', async () => {
    const { generatePracticeQuestions } = await import('../api/_practice-generators.js');
    const questions = generatePracticeQuestions(4, ['Word Problems'], 'hard', 1);
    expect(questions.length).toBe(1);
    expect(questions[0]._sourceId).toBe('gsm8k-hard-1');
    expect(questions[0]._difficulty).toBe('hard');
  });

  it('falls back to algorithmic questions when no pool question matches the difficulty', async () => {
    const { generatePracticeQuestions } = await import('../api/_practice-generators.js');
    const questions = generatePracticeQuestions(4, ['Word Problems'], 'medium', 1);
    // Fixture has no grade-4 medium Word Problems, so it should pad algorithmically.
    expect(questions.length).toBe(1);
    expect(questions[0]._source).toBe('algorithmic');
  });

  it('still respects grade boundaries when difficulty filtering', async () => {
    const { generatePracticeQuestions } = await import('../api/_practice-generators.js');
    const questions = generatePracticeQuestions(5, ['Word Problems'], 'medium', 1);
    expect(questions.length).toBe(1);
    expect(questions[0]._sourceId).toBe('gsm8k-g5m-1');
  });

  it('extended pool is ignored when EXTENDED_POOL_ENABLED is not true', async () => {
    process.env.EXTENDED_POOL_ENABLED = 'false';
    const { generatePracticeQuestions } = await import('../api/_practice-generators.js');
    const questions = generatePracticeQuestions(4, ['Word Problems'], 'easy', 1);
    expect(questions.length).toBe(1);
    expect(questions[0]._source).toBe('algorithmic');
  });
});
