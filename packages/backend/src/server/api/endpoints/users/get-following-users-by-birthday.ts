/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type {
	FollowingsRepository,
	UserProfilesRepository,
} from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import type { Packed } from '@/misc/json-schema.js';

import { birthdayCharacters } from '@/misc/birthday-characters.js';

type UserItem = {
	type: 'user';
	id: string;
	birthday: string; // "YYYY-MM-DD"
	user: Packed<'UserLite'>;
};

type CharacterItem = {
	type: 'character';
	id: string;
	birthday: string; // "YYYY-MM-DD" (next upcoming date)
	character: {
		name: string;
		url: string;
	};
};

type ResponseItem = UserItem | CharacterItem;

export const meta = {
	tags: ['users'],

	requireCredential: true,
	kind: 'read:account',

	description: 'Retrieve users who have a birthday on the specified range.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				type: { type: 'string', optional: false, nullable: false },
				id: { type: 'string', optional: false, nullable: false, format: 'misskey:id' },
				birthday: { type: 'string', optional: false, nullable: false },

				// user item
				user: { type: 'object', optional: true, nullable: true, ref: 'UserLite' },

				// character item
				character: {
					type: 'object',
					optional: true,
					nullable: true,
					properties: {
						name: { type: 'string', optional: false, nullable: false },
						url: { type: 'string', optional: false, nullable: false },
					},
				},
			},
			required: ['type', 'id', 'birthday'],
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		birthday: {
			oneOf: [{
				type: 'object',
				properties: {
					month: { type: 'integer', minimum: 1, maximum: 12 },
					day: { type: 'integer', minimum: 1, maximum: 31 },
				},
				required: ['month', 'day'],
			}, {
				type: 'object',
				properties: {
					begin: {
						type: 'object',
						properties: {
							month: { type: 'integer', minimum: 1, maximum: 12 },
							day: { type: 'integer', minimum: 1, maximum: 31 },
						},
						required: ['month', 'day'],
					},
					end: {
						type: 'object',
						properties: {
							month: { type: 'integer', minimum: 1, maximum: 12 },
							day: { type: 'integer', minimum: 1, maximum: 31 },
						},
						required: ['month', 'day'],
					},
				},
				required: ['begin', 'end'],
			}],
		},
	},
	required: ['birthday'],
} as const;

function toMmdd(month: number, day: number): number {
	return month * 100 + day;
}

function parseMmddString(mmdd: string): { month: number; day: number } | null {
	const m = mmdd.match(/^(\d{2})-(\d{2})$/);
	if (!m) return null;
	const month = parseInt(m[1], 10);
	const day = parseInt(m[2], 10);
	if (!Number.isFinite(month) || !Number.isFinite(day)) return null;
	if (month < 1 || month > 12) return null;
	if (day < 1 || day > 31) return null;
	return { month, day };
}

function isInRangeMmdd(value: number, begin: number, end: number): boolean {
	if (begin <= end) {
		return value >= begin && value <= end;
	}
	// across year end (e.g. 12/31 -> 1/02)
	return value >= begin || value <= end;
}

function formatYmd(d: Date): string {
	return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${(d.getDate()).toString().padStart(2, '0')}`;
}

function nextUpcomingDateForMmdd(month: number, day: number, now = new Date()): Date {
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);

	const d = new Date(today);
	d.setMonth(month - 1, day);
	d.setHours(0, 0, 0, 0);

	// If already passed today, move to next year
	if (d.getTime() < today.getTime()) {
		d.setFullYear(d.getFullYear() + 1);
	}

	return d;
}

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// ----- user birthdays (existing behavior) -----
			const query = this.followingsRepository
				.createQueryBuilder('following')
				.andWhere('following.followerId = :userId', { userId: me.id })
				.innerJoin(this.userProfilesRepository.metadata.targetName, 'followeeProfile', 'followeeProfile.userId = following.followeeId');

			let beginMmdd: number;
			let endMmdd: number;

			if (Object.hasOwn(ps.birthday, 'begin') && Object.hasOwn(ps.birthday, 'end')) {
				const range = ps.birthday as { begin: { month: number; day: number }; end: { month: number; day: number }; };

				beginMmdd = toMmdd(range.begin.month, range.begin.day);
				endMmdd = toMmdd(range.end.month, range.end.day);

				if (beginMmdd <= endMmdd) {
					query.andWhere('get_birthday_date(followeeProfile.birthday) BETWEEN :begin AND :end', { begin: beginMmdd, end: endMmdd });
				} else {
					query.andWhere(new Brackets(qb => {
						qb.where('get_birthday_date(followeeProfile.birthday) BETWEEN :begin AND 1231', { begin: beginMmdd });
						qb.orWhere('get_birthday_date(followeeProfile.birthday) BETWEEN 101 AND :end', { end: endMmdd });
					}));
				}
			} else {
				const { month, day } = ps.birthday as { month: number; day: number };
				beginMmdd = toMmdd(month, day);
				endMmdd = beginMmdd;
				query.andWhere('get_birthday_date(followeeProfile.birthday) BETWEEN :birthday AND :birthday', { birthday: beginMmdd });
			}

			query.select('following.followeeId', 'user_id');
			query.addSelect('get_birthday_date(followeeProfile.birthday)', 'birthday_date');
			query.orderBy('birthday_date', 'ASC');

			// NOTE: we intentionally fetch "more" and apply offset/limit after merging character items
			const rawUsers = await query
				.offset(0).limit(250) // keep it simple; adjust if you want
				.getRawMany<{ birthday_date: number; user_id: string }>();

			const packedUsers = new Map<string, Packed<'UserLite'>>((
				await this.userEntityService.packMany(
					rawUsers.map(u => u.user_id),
					me,
					{ schema: 'UserLite' },
				)
			).map(u => [u.id, u]));

			const userItems: UserItem[] = rawUsers
				.map(item => {
					const birthday = new Date();
					birthday.setHours(0, 0, 0, 0);
					birthday.setMonth(Math.floor(item.birthday_date / 100) - 1, item.birthday_date % 100);

					if (birthday.getTime() < new Date().setHours(0, 0, 0, 0)) {
						birthday.setFullYear(new Date().getFullYear() + 1);
					}

					const birthdayStr = formatYmd(birthday);
					const user = packedUsers.get(item.user_id);
					if (!user) return null;

					return {
						type: 'user',
						id: item.user_id,
						birthday: birthdayStr,
						user,
					} satisfies UserItem;
				})
				.filter((x): x is UserItem => x != null);

			// ----- character birthdays (from static list) -----
			const now = new Date();

			const characterItems: CharacterItem[] = birthdayCharacters.flatMap((c) => {
				const md = parseMmddString(c.birthday);
				if (!md) return [];

				const mmdd = toMmdd(md.month, md.day);
				if (!isInRangeMmdd(mmdd, beginMmdd, endMmdd)) return [];

				const next = nextUpcomingDateForMmdd(md.month, md.day, now);

				return [{
					type: 'character',
					id: c.id,
					birthday: formatYmd(next),
					character: {
						name: c.name,
						url: c.url,
					},
				} satisfies CharacterItem];
			});
			// ----- merge, sort, slice -----
			const merged: ResponseItem[] = [...userItems, ...characterItems];

			merged.sort((a, b) => {
				const ta = new Date(a.birthday).getTime();
				const tb = new Date(b.birthday).getTime();
				return ta - tb;
			});

			return merged.slice(ps.offset, ps.offset + ps.limit) as ResponseItem[];
		});
	}
}
