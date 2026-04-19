/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type BirthdayCharacter = {
	id: string;
	name: string;
	birthday: string; // "MM-DD"
	url: string;
};

export const birthdayCharacters: BirthdayCharacter[] = [
	// TODO: ここにキャラクターを追加
	// birthday は必ず "MM-DD" のゼロ埋め（例 "04-15"）
	{ id: 'char-001', name: 'キャラA', birthday: '04-20', url: 'https://example.com/charA' },
	{ id: 'char-002', name: 'キャラB', birthday: '04-22', url: 'https://example.com/charB' },
];
