/** Stable boundaries shared by UI and HTTP services. User text is never translated. */
export type Language = 'en' | 'ru';
export type ThemeChoice = 'system' | 'light' | 'dark';
export type VoteChoice = 0 | 1;
export interface MajorityQuestion { id: number; question: string; options: [string, string]; counts: [number, number]; choice: string | null }
export interface MajorityList { questions: MajorityQuestion[] }
export interface VoteReceipt { ok: true }
export type MajorityResponse = MajorityList | VoteReceipt;
export function isMajorityList(value: MajorityResponse): value is MajorityList { return 'questions' in value; }
export interface Stroke { color: string; points: Array<readonly [number, number]> }
export type DrawingState = { status: 'idle' } | { status: 'drawing'; deadline: number; strokes: Stroke[] } | { status: 'finished'; strokes: Stroke[] };
