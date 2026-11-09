/** Stable boundaries shared by UI and HTTP services. User text is never translated. */
export type Language = 'en' | 'ru';
export type ThemeChoice = 'system' | 'light' | 'dark';
export type VoteChoice = 0 | 1;
export interface QuestionSnapshot { id: string; revision: number; question: string; options: readonly [string, string]; en: { question: string; options: readonly [string, string] } }
export interface MajorityQuestion extends QuestionSnapshot { counts: [number, number]; choice: '0' | '1' | null; answerRevision: number | null; answerSnapshot?: QuestionSnapshot }
export interface MajorityList { questions: MajorityQuestion[]; legacyIds: readonly string[]; unassignedLegacy: number }
export interface VoteReceipt { ok: true; id: string; duplicate: boolean; answerRevision: number }
export type MajorityResponse = MajorityList | VoteReceipt;
export function isMajorityList(value: MajorityResponse): value is MajorityList { return 'questions' in value; }
export interface Stroke { color: string; points: Array<readonly [number, number]> }
export type DrawingState = { status: 'idle' } | { status: 'drawing'; deadline: number; strokes: Stroke[] } | { status: 'finished'; strokes: Stroke[] };
