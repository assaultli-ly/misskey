<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<!-- user -->
	<template v-if="isUserItem">
		<MkA :to="userPage(item.user)" style="overflow: clip;">
			<MkUserCardMini :user="item.user" :withChart="false" style="text-overflow: ellipsis; background: inherit; border-radius: unset;">
				<template #sub>
					<span>{{ countdownDate }}</span>
					<span> / </span>
					<span class="_monospace">@{{ acct(item.user) }}</span>
				</template>
			</MkUserCardMini>
		</MkA>

		<button
			v-tooltip.noDelay="i18n.ts.note"
			class="_button"
			:class="$style.post"
			@click="os.post({ initialText: `@${item.user.username}${item.user.host ? `@${item.user.host}` : ''} ` })"
		>
			<i class="ti-fw ti ti-confetti" :class="$style.postIcon"></i>
		</button>
	</template>

	<!-- character -->
	<template v-else>
		<a
			:href="(item as any).character.url"
			target="_blank"
			rel="noopener"
			:class="$style.characterLink"
			style="overflow: clip;"
		>
			<div :class="$style.characterRow">
				<div :class="$style.characterMain">
					<span :class="$style.characterName">{{ (item as any).character.name }}</span>
				</div>
				<div :class="$style.characterSub">
					<span>{{ countdownDate }}</span>
				</div>
			</div>
		</a>

		<!-- keep grid layout (2nd column) -->
		<div></div>
	</template>
</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { useLowresTime } from '@/composables/use-lowres-time.js';
import { userPage, acct } from '@/filters/user.js';

const props = defineProps<{
	item: Misskey.entities.UsersGetFollowingUsersByBirthdayResponse[number] & { type?: 'user' | 'character' };
}>();

const isUserItem = computed(() => (props.item as any).type !== 'character' && (props.item as any).user != null);

const now = useLowresTime();
const nowDate = computed(() => {
	const date = new Date(now.value);
	date.setHours(0, 0, 0, 0);
	return date;
});

const birthdayDate = computed(() => {
	const [year, month, day] = props.item.birthday.split('-').map((v) => parseInt(v, 10));
	return new Date(year, month - 1, day, 0, 0, 0, 0);
});

const countdownDate = computed(() => {
	const days = Math.floor((birthdayDate.value.getTime() - nowDate.value.getTime()) / (1000 * 60 * 60 * 24));
	if (days === 0) {
		return i18n.ts.today;
	} else if (days > 0) {
		return i18n.tsx._timeIn.days({ n: days });
	} else {
		return i18n.tsx._ago.daysAgo({ n: Math.abs(days) });
	}
});

// handy cast for user template
const item = computed(() => props.item as any);
</script>

<style lang="scss" module>
.root {
	box-sizing: border-box;
	display: grid;
	align-items: center;
	grid-template-columns: auto 56px;
}

.post {
	display: flex;
	justify-content: center;
	align-items: center;
	height: 40px;
	width: 40px;
	margin-right: 16px;
	aspect-ratio: 1/1;
	border-radius: 100%;
	background: linear-gradient(90deg, var(--MI_THEME-buttonGradateA), var(--MI_THEME-buttonGradateB));

	&:hover {
		background: linear-gradient(90deg, hsl(from var(--MI_THEME-accent) h s calc(l + 5)), hsl(from var(--MI_THEME-accent) h s calc(l + 5)));
	}
}

.postIcon {
	color: var(--MI_THEME-fgOnAccent);
}

.characterLink {
	display: block;
	text-decoration: none;
	color: inherit;
}

.characterRow {
	padding: 8px 12px 8px 16px;
}

.characterMain {
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.characterName {
	font-weight: 600;
}

.characterSub {
	opacity: 0.75;
	font-size: 85%;
	margin-top: 2px;
}
</style>
