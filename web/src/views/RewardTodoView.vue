<template>
  <main class="todo-page">
    <header class="page-toolbar">
      <span aria-hidden="true"></span>
      <div class="toolbar-title"><span>{{ activeTabLabel }}</span><small>一件一件来，不着急</small></div>
      <button class="icon-button" type="button" :disabled="loading" aria-label="刷新待办" @click="loadItems">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 5v6h-6" /></svg>
      </button>
    </header>

    <p v-if="error && loaded" class="form-error" role="alert">{{ error }}；当前显示上次读取的内容。</p>
    <nav class="todo-tabs" aria-label="小票功能">
      <button v-for="tab in tabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" :aria-current="activeTab === tab.id ? 'page' : undefined" @click="activeTab = tab.id">
        <span>{{ tab.label }}</span><small>{{ tab.english }}</small>
      </button>
    </nav>

    <section v-if="activeTab === 'calendar'" class="paper-panel calendar-home" aria-labelledby="calendar-heading">
      <header class="panel-heading">
        <div><span class="eyebrow">GLIMMER CALENDAR</span><h1 id="calendar-heading">完成日历</h1></div>
        <div class="points-badge" aria-label="当前积分"><strong>{{ pointsState.balance }}</strong><span>积分</span></div>
      </header>
      <div class="calendar-toolbar">
        <button type="button" aria-label="上一个月" @click="changeCalendarMonth(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
        <strong>{{ calendarMonthLabel }}</strong>
        <button type="button" aria-label="下一个月" :disabled="calendarViewMonth >= currentMonth" @click="changeCalendarMonth(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
      </div>
      <van-loading v-if="calendarLoading" class="loading-state" size="22px" vertical>翻开这个月</van-loading>
      <div v-else class="home-calendar" role="grid" :aria-label="`${calendarMonthLabel}完成日历`">
        <span v-for="label in weekLabels" :key="`home-${label}`" class="home-calendar__weekday" role="columnheader">{{ label }}</span>
        <template v-for="cell in homeCalendarCells" :key="cell.key">
          <span v-if="!cell.day" class="home-calendar__day empty" aria-hidden="true"></span>
          <button v-else type="button" class="home-calendar__day" :class="{ completed: cell.completedCount, today: cell.today }" role="gridcell" :aria-label="cell.ariaLabel" @click="openDay(cell.date)">
            <span class="home-calendar__number">{{ cell.day }}</span>
            <span v-for="item in cell.items.slice(0, 2)" :key="`${cell.date}-${item.itemId}`" class="home-calendar__mark">·{{ shortTask(item.body) }}</span>
            <span v-if="cell.items.length > 2" class="home-calendar__more">+{{ cell.items.length - 2 }}</span>
            <span v-if="cell.isPaid" class="home-calendar__paid">PAID</span>
            <span v-if="cell.pointsEarned" class="home-calendar__points">+{{ cell.pointsEarned }}</span>
          </button>
        </template>
      </div>
      <p class="panel-note">一次性任务只在实际完成的那天留下记录；未完成的事继续安静地待在今日清单。</p>
    </section>

    <section v-if="activeTab === 'today'" class="receipt" aria-labelledby="today-heading">
      <header class="receipt__head">
        <p class="receipt__brand">{{ appConfig.assistantName }} &amp; {{ appConfig.userName }} · {{ appConfig.appName }}</p>
        <h1 id="today-heading">Today's Receipt</h1>
        <p class="receipt__date">{{ dateLabel }}</p>
      </header>

      <div class="receipt__dashes" aria-hidden="true">------------------------------------------------</div>
      <div class="receipt__meta">
        <p><span>开店</span><span>00:00</span></p>
        <p><span>柜员</span><span>{{ appConfig.assistantName }}</span></p>
        <p><span>顾客</span><span>{{ appConfig.userName }}</span></p>
        <p><span>此刻</span><span>{{ currentTimeLabel }}</span></p>
        <p><span>单据号</span><span>#{{ receiptSerial }}</span></p>
      </div>

      <div class="receipt__dashes" aria-hidden="true">------------------------------------------------</div>
      <div class="receipt__section-bar">
        <p class="receipt__section-label">TODAY'S ORDER · {{ items.length }} 项</p>
        <button class="receipt__add-button" type="button" aria-label="添加一件小事" @click="openTodoComposer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <van-loading v-if="loading && !loaded" class="loading-state" size="24px" vertical>展开今天的小票</van-loading>
      <div v-else-if="error && !loaded" class="message-card message-card--error" role="alert">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 4.7 2.8 18a2 2 0 0 0 1.74 3h14.92a2 2 0 0 0 1.74-3L13.7 4.7a2 2 0 0 0-3.4 0Z" /></svg>
        <div><strong>待办服务还没接上</strong><p>{{ error }}</p></div>
        <button type="button" @click="loadItems">重试</button>
      </div>

      <template v-else>
        <section v-if="fixedItems.length" class="ticket-section" aria-labelledby="daily-heading">
          <header class="section-heading">
            <h2 id="daily-heading">DAILY · 每日打卡</h2>
            <small>{{ fixedDoneCount }} / {{ fixedItems.length }}</small>
          </header>
          <TodoRow v-for="item in fixedItems" :key="item.id" :item="item" :busy="saving || Boolean(busyId)" @edit="editItem" @toggle="toggleItem" @archive="archiveItem" @month="openMonth" />
        </section>

        <section v-if="oneOffItems.length" class="ticket-section" aria-labelledby="once-heading">
          <header class="section-heading">
            <h2 id="once-heading">TODAY · 今天要记得</h2>
            <small>{{ oneOffDoneCount }} / {{ oneOffItems.length }}</small>
          </header>
          <TodoRow v-for="item in oneOffItems" :key="item.id" :item="item" :busy="saving || Boolean(busyId)" @edit="editItem" @toggle="toggleItem" @archive="archiveItem" />
        </section>

        <div v-if="!items.length" class="empty-state">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3H7zM5 6h14v15H5zM8 11h8M8 15h6" /></svg>
          <h2>今天还是一张空白小票</h2>
          <p>写下一件想完成的小事，或者请{{ appConfig.assistantName }}帮你记上。</p>
        </div>
      </template>

      <div class="receipt__summary" aria-label="今日结算">
        <div class="receipt__dashes" aria-hidden="true">------------------------------------------------</div>
        <p><span>小计</span><span>{{ items.length }} 项</span></p>
        <p class="faded"><span>已结清</span><span>{{ completedCount }} 项</span></p>
        <p><span>未结清</span><span>{{ items.length - completedCount }} 项</span></p>
        <div class="receipt__progress" :aria-label="`今日完成率 ${progressPercent}%`">
          <span>进度</span><span aria-hidden="true">{{ progressBar }}</span><strong>{{ progressPercent }}%</strong>
        </div>
        <div class="receipt__dashes" aria-hidden="true">------------------------------------------------</div>
      </div>

      <div class="receipt__stamp" :class="{ 'receipt__stamp--paid': allDone }">{{ allDone ? "PAID · 谢谢" : "OPEN · 慢慢来" }}</div>
      <p class="receipt__note">今天完成的每一件小事，都会好好留在这里。</p>
      <div class="receipt__barcode" aria-hidden="true"></div>
      <p class="receipt__barcode-serial" aria-hidden="true">{{ receiptSerial }} · LOCAL FIRST</p>
      <div class="receipt__footer" aria-hidden="true">
        <span>THANK YOU</span><span>·</span><span>KEEP GROWING</span>
      </div>
    </section>

    <section v-if="activeTab === 'rewards'" class="paper-panel rewards-panel" aria-labelledby="rewards-heading">
      <header class="panel-heading">
        <div><span class="eyebrow">LITTLE REWARDS</span><h1 id="rewards-heading">奖励柜</h1></div>
        <div class="panel-heading__actions">
          <div class="points-badge" aria-label="当前积分"><strong>{{ pointsState.balance }}</strong><span>积分</span></div>
          <button class="panel-add-button" type="button" aria-label="添加一个奖励" @click="openRewardComposer">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>
      </header>
      <p class="panel-note">完成小事攒下的积分，可以换成真正想送给自己的奖励。没有惩罚，也不催着花掉。</p>
      <div v-if="rewardsLoading" class="loading-state"><van-loading size="22px" vertical>打开奖励柜</van-loading></div>
      <div v-else-if="rewards.length" class="reward-list">
        <article v-for="reward in rewards" :key="reward.id" class="reward-card" :class="`reward-card--${reward.status}`">
          <div class="reward-card__copy">
            <div class="reward-title-row">
              <h2>{{ reward.name }}</h2>
              <button v-if="reward.status !== 'obtained'" class="reward-edit-button" type="button" :disabled="rewardBusy" :aria-label="`编辑奖励：${reward.name}`" @click="editReward(reward)">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg>
              </button>
              <span class="reward-status">{{ rewardStatusLabel(reward.status) }}</span>
            </div>
            <p v-if="reward.description">{{ reward.description }}</p>
          </div>
          <div class="reward-controls">
            <strong class="reward-cost"><span>{{ reward.cost }}</span> 积分</strong>
            <button v-if="reward.status !== 'obtained'" class="reward-redeem-button" type="button" :disabled="!reward.affordable || rewardBusy" @click="redeemReward(reward)">{{ reward.affordable ? '兑换' : '积分不足' }}</button>
            <span v-else class="reward-obtained">已获得</span>
            <button class="reward-archive-button" type="button" :disabled="rewardBusy" :aria-label="`归档奖励：${reward.name}`" title="归档后从奖励柜隐藏" @click="archiveReward(reward)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM3 3h18v4H3zM9 11h6" /></svg>
            </button>
          </div>
        </article>
      </div>
      <p v-else class="reward-empty">奖励柜还是空的。先放一件会让你开心的小东西吧。</p>

      <details v-if="archivedRewards.length" class="archived-rewards">
        <summary><span>已归档奖励</span><strong>{{ archivedRewards.length }}</strong></summary>
        <div class="archived-reward-list">
          <article v-for="reward in archivedRewards" :key="reward.id">
            <div><h2>{{ reward.name }}</h2><p v-if="reward.description">{{ reward.description }}</p></div>
            <button type="button" :disabled="rewardBusy" @click="restoreReward(reward)">恢复</button>
          </article>
        </div>
      </details>

    </section>

    <div class="sr-live" aria-live="polite">{{ announcement }}</div>

    <van-popup v-model:show="composerOpen" position="bottom" round safe-area-inset-bottom class="form-sheet" :close-on-click-overlay="!saving" @closed="resetTodoDraft">
      <section class="composer composer--sheet" aria-labelledby="composer-heading">
        <header class="sheet-header">
          <div><span class="eyebrow">ADD A LITTLE THING</span><h2 id="composer-heading">{{ editingId ? "修改这件小事" : "添一件小事" }}</h2></div>
          <button class="icon-button" type="button" aria-label="关闭待办编辑" :disabled="saving" @click="composerOpen = false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <form @submit.prevent="createItem">
          <label for="todo-body">待办内容</label>
          <input id="todo-body" v-model.trim="draft.body" type="text" maxlength="500" autocomplete="off" placeholder="比如：晚饭后散步 20 分钟" required />
          <fieldset class="points-fieldset">
            <legend>完成后获得多少积分？</legend>
            <div class="point-options">
              <label v-for="value in pointPresets" :key="value" :class="{ active: draft.points === value }"><input v-model.number="draft.points" type="radio" :value="value" />{{ value }}</label>
            </div>
          </fieldset>
          <template v-if="!editingId">
            <fieldset>
              <legend>这件事多久出现一次？</legend>
              <div class="segmented">
                <label :class="{ active: draft.kind === 'once' }"><input v-model="draft.kind" type="radio" value="once" />只做一次</label>
                <label :class="{ active: draft.kind === 'fixed' }"><input v-model="draft.kind" type="radio" value="fixed" />每天打卡</label>
              </div>
            </fieldset>
            <label class="reminder-toggle">
              <span><strong>到点提醒我</strong><small>{{ appConfig.reminderDelivery === 'ready' ? `提醒会由独立服务进入${appConfig.assistantName}的投递队列` : '主动提醒适配尚未启用，安装完成后才能使用' }}</small></span>
              <input v-model="draft.hasReminder" type="checkbox" :disabled="draft.kind === 'fixed' || appConfig.reminderDelivery !== 'ready'" />
            </label>
            <label v-if="draft.hasReminder && draft.kind === 'once'" for="todo-time">提醒时间</label>
            <input v-if="draft.hasReminder && draft.kind === 'once'" id="todo-time" v-model="draft.at" type="time" required />
          </template>
          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>
          <button class="primary-button" type="submit" :disabled="saving || !draft.body">
            <span v-if="saving" class="spinner" aria-hidden="true"></span>
            {{ saving ? "正在保存" : editingId ? "保存修改" : "写上小票" }}
          </button>
          <button v-if="editingId" type="button" class="secondary-button" :disabled="saving" @click="cancelEdit">取消修改</button>
        </form>
      </section>
    </van-popup>

    <van-popup v-model:show="rewardComposerOpen" position="bottom" round safe-area-inset-bottom class="form-sheet" :close-on-click-overlay="!rewardBusy" @closed="resetRewardDraft">
      <section class="reward-composer" aria-labelledby="reward-composer-heading">
        <header class="sheet-header">
          <div><span class="eyebrow">{{ rewardEditingId ? 'EDIT A REWARD' : 'ADD A REWARD' }}</span><h2 id="reward-composer-heading">{{ rewardEditingId ? '修改奖励' : '放进一个奖励' }}</h2></div>
          <button class="icon-button" type="button" aria-label="关闭奖励编辑" :disabled="rewardBusy" @click="rewardComposerOpen = false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <form class="reward-form" @submit.prevent="saveReward">
          <label for="reward-name">奖励名称</label>
          <input id="reward-name" v-model.trim="rewardDraft.name" type="text" maxlength="120" required placeholder="比如：买一本想看的书" />
          <label for="reward-description">小小备注</label>
          <input id="reward-description" v-model.trim="rewardDraft.description" type="text" maxlength="500" placeholder="为什么想要它" />
          <label for="reward-cost">需要积分</label>
          <input id="reward-cost" v-model.number="rewardDraft.cost" type="number" min="0" max="999" step="1" inputmode="numeric" required />
          <p v-if="rewardError" class="form-error" role="alert">{{ rewardError }}</p>
          <button class="primary-button" type="submit" :disabled="rewardBusy || !rewardDraft.name">
            <span v-if="rewardBusy" class="spinner" aria-hidden="true"></span>
            {{ rewardBusy ? '正在保存' : rewardEditingId ? '保存修改' : '放进奖励柜' }}
          </button>
          <button v-if="rewardEditingId" class="secondary-button" type="button" :disabled="rewardBusy" @click="cancelRewardEdit">取消修改</button>
        </form>
      </section>
    </van-popup>

    <van-popup v-model:show="monthOpen" position="bottom" round safe-area-inset-bottom class="month-sheet" @closed="monthStats = null">
      <section v-if="selectedItem" aria-labelledby="month-heading">
        <header class="sheet-header">
          <div><span class="eyebrow">MONTHLY CHECK-IN</span><h2 id="month-heading">{{ selectedItem.body }}</h2></div>
          <button class="icon-button" type="button" aria-label="关闭月度打卡" @click="monthOpen = false">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div class="month-picker">
          <button type="button" aria-label="上一个月" @click="changeMonth(-1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
          <strong>{{ monthLabel }}</strong>
          <button type="button" aria-label="下一个月" :disabled="viewMonth >= currentMonth" @click="changeMonth(1)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
        </div>
        <van-loading v-if="monthLoading" class="loading-state" size="22px" vertical>读取打卡记录</van-loading>
        <template v-else-if="monthStats">
          <div class="stats-grid">
            <article><span>完成天数</span><strong>{{ monthStats.completedDays }}</strong><small>/ {{ monthStats.eligibleDays }} 天</small></article>
            <article><span>当前连续</span><strong>{{ monthStats.currentStreak }}</strong><small>天</small></article>
            <article><span>最长连续</span><strong>{{ monthStats.longestStreak }}</strong><small>天</small></article>
          </div>
          <div class="calendar" role="grid" :aria-label="`${monthLabel}打卡日历`">
            <span v-for="label in weekLabels" :key="label" class="calendar__weekday" role="columnheader">{{ label }}</span>
            <span v-for="cell in calendarCells" :key="cell.key" class="calendar__day" :class="{ completed: cell.completed, empty: !cell.day, today: cell.today }" role="gridcell" :aria-label="cell.ariaLabel">
              <span>{{ cell.day }}</span><svg v-if="cell.completed" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3 3 7-7" /></svg>
            </span>
          </div>
          <p class="sheet-note">打卡只记录明确完成的日子；每日复位不会擦掉这些历史。</p>
        </template>
        <p v-else-if="monthError" class="form-error" role="alert">{{ monthError }}</p>
      </section>
    </van-popup>

    <van-popup v-model:show="dayOpen" position="bottom" round safe-area-inset-bottom class="month-sheet" @closed="dayData = null">
      <section aria-labelledby="day-heading">
        <header class="sheet-header">
          <div><span class="eyebrow">DAILY RECEIPT · 当天完成记录</span><h2 id="day-heading">{{ dayDisplayLabel }}</h2></div>
          <button class="icon-button" type="button" aria-label="关闭当天小票" @click="dayOpen = false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
        </header>
        <p class="sheet-note sheet-note--intro">这里只展示这一天实际完成的事项，是只读的小票记录。</p>
        <van-loading v-if="dayLoading" class="loading-state" size="22px" vertical>读取当天小票</van-loading>
        <template v-else-if="dayData">
          <div class="day-summary"><span>完成 {{ dayData.completedCount }} 件</span><strong>+{{ dayData.pointsEarned }} 积分</strong></div>
          <ol v-if="dayData.items.length" class="day-list">
            <li v-for="item in dayData.items" :key="`${item.itemId}-${item.localDate}`"><span>[✓]</span><div><strong>{{ item.body }}</strong><small>{{ item.isFixed ? '每日打卡' : '一次性任务' }} · {{ completedTime(item.completedAt) }}</small></div><b>+{{ item.points }}</b></li>
          </ol>
          <p v-else class="reward-empty">这天还没有完成记录。</p>
          <p class="sheet-note">过去的小票只读展示；需要补记时，再单独启用有审计的补记功能。</p>
        </template>
      </section>
    </van-popup>
  </main>
</template>

<script setup>
import { computed, defineComponent, h, nextTick, onMounted, reactive, ref, watch } from "vue";
import { todoApi } from "../api/todo";

const appConfig = reactive({ userName: "你", assistantName: "搭档", appName: "REWARD TODO", reminderDelivery: "not_checked" });

const TodoRow = defineComponent({
  props: { item: { type: Object, required: true }, busy: Boolean },
  emits: ["toggle", "archive", "month", "edit"],
  setup(props, { emit }) {
    const timeLabel = computed(() => props.item.triggerAt ? new Date(props.item.triggerAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "");
    return () => h("article", { class: ["todo-row", { "todo-row--done": props.item.done, "todo-row--overdue": props.item.overdue }] }, [
      h("button", { class: "check-button", type: "button", disabled: props.busy, "aria-label": props.item.done ? `将${props.item.body}标为未完成` : `完成${props.item.body}`, onClick: () => emit("toggle", props.item) }, [
        h("span", { "aria-hidden": "true" }, props.item.done ? "[✓]" : "[ ]"),
      ]),
      h("span", { class: ["checklist-trigger", { "checklist-trigger--overdue": props.item.overdue }] }, timeLabel.value || (props.item.isFixed ? "每日" : "—")),
      h("div", { class: "todo-row__body" }, [
        h("strong", props.item.body),
        h("div", { class: "todo-row__meta" }, [
          h("span", props.item.createdBy === "assistant" ? `by ${appConfig.assistantName}` : `by ${appConfig.userName}`),
          h("span", `+${props.item.points || 0} 积分`),
          props.item.overdue ? h("span", { class: "overdue-label" }, "已到点") : null,
        ]),
      ]),
      h("div", { class: "row-actions" }, [
        h("button", { type: "button", disabled: props.busy, "aria-label": `编辑${props.item.body}`, onClick: () => emit("edit", props.item) }, "编辑"),
        props.item.isFixed ? h("button", { type: "button", "aria-label": `查看${props.item.body}月度打卡`, onClick: () => emit("month", props.item) }, [h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, [h("rect", { x: "4", y: "5", width: "16", height: "15", rx: "2" }), h("path", { d: "M8 3v4M16 3v4M4 9h16" })])]) : null,
        h("button", { class: "archive-button", type: "button", "aria-label": `归档${props.item.body}`, onClick: () => emit("archive", props.item) }, [h("span", { "aria-hidden": "true" }, "×")]),
      ]),
    ]);
  },
});

const loading = ref(false);
const loaded = ref(false);
const error = ref("");
const items = ref([]);
const busyId = ref("");
const saving = ref(false);
const formError = ref("");
const announcement = ref("");
const tabs = [
  { id: "calendar", label: "日历", english: "CALENDAR" },
  { id: "today", label: "今日小票", english: "TODAY" },
  { id: "rewards", label: "奖励柜", english: "REWARDS" },
];
const activeTab = ref("calendar");
const activeTabLabel = computed(() => tabs.find((tab) => tab.id === activeTab.value)?.label || "小票");
const pointPresets = [0, 1, 3, 5, 8];
const editingId = ref("");
const composerOpen = ref(false);
function resetTodoDraft() {
  editingId.value = "";
  formError.value = "";
  Object.assign(draft, { body: "", kind: "once", hasReminder: false, at: "", points: 1 });
}
function openTodoComposer() {
  resetTodoDraft();
  composerOpen.value = true;
  nextTick(() => document.getElementById("todo-body")?.focus());
}
function editItem(item) {
  editingId.value = item.id;
  Object.assign(draft, { body: item.body, kind: item.isFixed ? "fixed" : "once", hasReminder: false, at: "", points: item.points || 0 });
  formError.value = "";
  composerOpen.value = true;
  nextTick(() => document.getElementById("todo-body")?.focus());
}
function cancelEdit() { composerOpen.value = false; }
const draft = reactive({ body: "", kind: "once", hasReminder: false, at: "", points: 1 });

const now = new Date();
const localToday = formatLocalDate(now);
const dateLabel = now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
const currentTimeLabel = now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
const receiptSerial = localToday.replaceAll("-", "");
const currentMonth = localToday.slice(0, 7);
const fixedItems = computed(() => items.value.filter((item) => item.isFixed));
const oneOffItems = computed(() => items.value.filter((item) => !item.isFixed));
const completedCount = computed(() => items.value.filter((item) => item.done).length);
const fixedDoneCount = computed(() => fixedItems.value.filter((item) => item.done).length);
const oneOffDoneCount = computed(() => oneOffItems.value.filter((item) => item.done).length);
const progressPercent = computed(() => items.value.length ? Math.round(completedCount.value / items.value.length * 100) : 0);
const progressBar = computed(() => {
  const filled = Math.round(progressPercent.value / 10);
  return `${"█".repeat(filled)}${"░".repeat(10 - filled)}`;
});
const allDone = computed(() => items.value.length > 0 && completedCount.value === items.value.length);

watch(() => draft.kind, (kind) => { if (kind === "fixed") { draft.hasReminder = false; draft.at = ""; } });

async function loadItems() {
  loading.value = true; error.value = "";
  try {
    const result = await todoApi.list();
    items.value = Array.isArray(result.items) ? result.items : [];
    loaded.value = true;
  } catch (requestError) { error.value = requestError.message || "读取失败"; }
  finally { loading.value = false; }
}

async function createItem() {
  if (!draft.body || saving.value) return;
  saving.value = true; formError.value = "";
  try {
    const payload = editingId.value ? { body: draft.body, points: draft.points } : { body: draft.body, isFixed: draft.kind === "fixed", points: draft.points };
    if (draft.kind === "once" && draft.hasReminder) payload.at = draft.at;
    const created = editingId.value ? await todoApi.update(editingId.value, payload) : await todoApi.create(payload);
    if (editingId.value) replaceItem(created); else items.value.push(created);
    editingId.value = "";
    announcement.value = `已经写下：${created.body}`;
    composerOpen.value = false;
  } catch (requestError) { formError.value = requestError.message || "暂时没写上，请重试"; }
  finally { saving.value = false; }
}

async function toggleItem(item) {
  if (busyId.value) return;
  busyId.value = item.id;
  try {
    const updated = await todoApi.setDone(item.id, !item.done);
    replaceItem(updated);
    await Promise.all([loadCalendar(), loadPointsAndRewards()]);
    announcement.value = updated.done ? `完成了：${updated.body}` : `已撤销：${updated.body}`;
  } catch (requestError) { announcement.value = requestError.message || "更新失败"; }
  finally { busyId.value = ""; }
}

async function archiveItem(item) {
  if (busyId.value || saving.value) return;
  if (!window.confirm(`要归档“${item.body}”吗？打卡历史会保留。`)) return;
  busyId.value = item.id;
  try {
    await todoApi.archive(item.id);
    items.value = items.value.filter((entry) => entry.id !== item.id);
    announcement.value = `已归档：${item.body}`;
  } catch (requestError) { announcement.value = requestError.message || "归档失败"; }
  finally { busyId.value = ""; }
}

function replaceItem(updated) {
  const index = items.value.findIndex((item) => item.id === updated.id);
  if (index >= 0) items.value.splice(index, 1, updated);
}

const monthOpen = ref(false);
const selectedItem = ref(null);
const monthStats = ref(null);
const monthLoading = ref(false);
const monthError = ref("");
const viewMonth = ref(currentMonth);
const weekLabels = ["一", "二", "三", "四", "五", "六", "日"];

const calendarViewMonth = ref(currentMonth);
const calendarData = ref({ month: currentMonth, days: [] });
const calendarLoading = ref(false);
const calendarMonthLabel = computed(() => {
  const [year, month] = calendarViewMonth.value.split("-");
  return `${year} 年 ${Number(month)} 月`;
});
const homeCalendarCells = computed(() => {
  const [year, month] = calendarViewMonth.value.split("-").map(Number);
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const byDate = new Map((calendarData.value.days || []).map((day) => [day.localDate, day]));
  const cells = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push({ key: `home-empty-start-${index}`, day: "" });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const data = byDate.get(date) || { completedCount: 0, totalCount: 0, fixedCount: 0, pointsEarned: 0, isPaid: false, items: [] };
    cells.push({
      key: date, date, day, today: date === localToday, ...data,
      ariaLabel: `${month}月${day}日，完成${data.completedCount}项${data.totalCount ? `，共${data.totalCount}项` : ""}，获得${data.pointsEarned}积分${data.isPaid ? "，全部完成，已结清" : ""}`,
    });
  }
  while (cells.length % 7) cells.push({ key: `home-empty-end-${cells.length}`, day: "" });
  return cells;
});
async function loadCalendar() {
  calendarLoading.value = true;
  try { calendarData.value = await todoApi.calendar(calendarViewMonth.value); }
  catch (requestError) { announcement.value = requestError.message || "完成日历读取失败"; }
  finally { calendarLoading.value = false; }
}
function changeCalendarMonth(delta) {
  const [year, month] = calendarViewMonth.value.split("-").map(Number);
  calendarViewMonth.value = new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
  loadCalendar();
}
function shortTask(body) { const value = String(body || ""); return value.length > 6 ? `${value.slice(0, 6)}…` : value; }

const dayOpen = ref(false);
const dayLoading = ref(false);
const dayData = ref(null);
const selectedDate = ref(localToday);
const dayDisplayLabel = computed(() => {
  const value = new Date(`${selectedDate.value}T12:00:00`);
  return value.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
});
async function openDay(date) {
  selectedDate.value = date; dayOpen.value = true; dayLoading.value = true;
  try { dayData.value = await todoApi.day(date); }
  catch (requestError) { announcement.value = requestError.message || "当天小票读取失败"; }
  finally { dayLoading.value = false; }
}
function completedTime(epoch) {
  return epoch ? new Date(epoch).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }) : "时间未记录";
}

const pointsState = ref({ balance: 0, ledger: [] });
const rewards = ref([]);
const archivedRewards = ref([]);
const rewardsLoading = ref(false);
const rewardBusy = ref(false);
const rewardError = ref("");
const rewardEditingId = ref("");
const rewardComposerOpen = ref(false);
const rewardDraft = reactive({ name: "", description: "", cost: 10 });
function resetRewardDraft() {
  rewardEditingId.value = "";
  rewardError.value = "";
  Object.assign(rewardDraft, { name: "", description: "", cost: 10 });
}
function openRewardComposer() {
  resetRewardDraft();
  rewardComposerOpen.value = true;
  nextTick(() => document.getElementById("reward-name")?.focus());
}
async function loadPointsAndRewards() {
  rewardsLoading.value = true;
  try {
    const [points, rewardResult] = await Promise.all([todoApi.points(), todoApi.rewards(true)]);
    pointsState.value = points;
    const allRewards = Array.isArray(rewardResult.items) ? rewardResult.items : [];
    rewards.value = allRewards.filter((reward) => !reward.archivedAt);
    archivedRewards.value = allRewards.filter((reward) => reward.archivedAt);
  } catch (requestError) { rewardError.value = requestError.message || "奖励柜读取失败"; }
  finally { rewardsLoading.value = false; }
}
async function saveReward() {
  if (!rewardDraft.name || rewardBusy.value) return;
  rewardBusy.value = true; rewardError.value = "";
  try {
    const payload = { name: rewardDraft.name, description: rewardDraft.description, cost: rewardDraft.cost };
    if (rewardEditingId.value) await todoApi.updateReward(rewardEditingId.value, payload);
    else await todoApi.createReward(payload);
    await loadPointsAndRewards();
    announcement.value = "奖励柜已经更新";
    rewardComposerOpen.value = false;
  } catch (requestError) { rewardError.value = requestError.message || "奖励保存失败"; }
  finally { rewardBusy.value = false; }
}
function editReward(reward) {
  rewardEditingId.value = reward.id;
  Object.assign(rewardDraft, { name: reward.name, description: reward.description || "", cost: reward.cost });
  rewardError.value = "";
  rewardComposerOpen.value = true;
  nextTick(() => document.getElementById("reward-name")?.focus());
}
function cancelRewardEdit() {
  rewardComposerOpen.value = false;
}
async function redeemReward(reward) {
  if (!window.confirm(`用 ${reward.cost} 积分兑换“${reward.name}”吗？`)) return;
  rewardBusy.value = true;
  try { await todoApi.redeemReward(reward.id); await loadPointsAndRewards(); announcement.value = `已经获得：${reward.name}`; }
  catch (requestError) { rewardError.value = requestError.message || "兑换失败"; }
  finally { rewardBusy.value = false; }
}
async function archiveReward(reward) {
  if (!window.confirm(`要归档“${reward.name}”吗？已有积分流水不会被删除。`)) return;
  rewardBusy.value = true;
  try { await todoApi.archiveReward(reward.id); await loadPointsAndRewards(); announcement.value = `已归档：${reward.name}`; }
  catch (requestError) { rewardError.value = requestError.message || "归档失败"; }
  finally { rewardBusy.value = false; }
}
async function restoreReward(reward) {
  rewardBusy.value = true;
  try { await todoApi.restoreReward(reward.id); await loadPointsAndRewards(); announcement.value = `已恢复：${reward.name}`; }
  catch (requestError) { rewardError.value = requestError.message || "恢复失败"; }
  finally { rewardBusy.value = false; }
}
function rewardStatusLabel(status) {
  return ({ wanted: "想要", available: "可兑换", obtained: "已获得", archived: "已归档" })[status] || "想要";
}
const monthLabel = computed(() => {
  const [year, month] = viewMonth.value.split("-");
  return `${year} 年 ${Number(month)} 月`;
});
const calendarCells = computed(() => {
  const [year, month] = viewMonth.value.split("-").map(Number);
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const completed = new Set((monthStats.value?.days || []).filter((day) => day.completed).map((day) => day.localDate));
  const cells = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push({ key: `empty-start-${index}`, day: "", ariaLabel: "空白" });
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const isCompleted = completed.has(date);
    cells.push({ key: date, day, completed: isCompleted, today: date === localToday, ariaLabel: `${month}月${day}日${isCompleted ? "，已完成" : "，未完成"}` });
  }
  while (cells.length % 7) cells.push({ key: `empty-end-${cells.length}`, day: "", ariaLabel: "空白" });
  return cells;
});

async function openMonth(item) {
  selectedItem.value = item; viewMonth.value = currentMonth; monthOpen.value = true; await loadMonth();
}
async function loadMonth() {
  if (!selectedItem.value) return;
  monthLoading.value = true; monthError.value = ""; monthStats.value = null;
  try { monthStats.value = await todoApi.month(selectedItem.value.id, viewMonth.value); }
  catch (requestError) { monthError.value = requestError.message || "读取月度记录失败"; }
  finally { monthLoading.value = false; }
}
function changeMonth(delta) {
  const [year, month] = viewMonth.value.split("-").map(Number);
  viewMonth.value = new Date(Date.UTC(year, month - 1 + delta, 1)).toISOString().slice(0, 7);
  loadMonth();
}

function formatLocalDate(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const record = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${record.year}-${record.month}-${record.day}`;
}

async function loadAppConfig() {
  try { Object.assign(appConfig, await todoApi.config()); }
  catch { /* The local defaults remain usable if config loading fails. */ }
}

onMounted(() => Promise.all([loadAppConfig(), loadItems(), loadCalendar(), loadPointsAndRewards()]));
</script>

<style scoped>
.session-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 16px; }
.session-actions button { min-height: 44px; padding: 8px 12px; color: var(--ink); background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.session-actions p { width: 100%; }
.todo-page {
  --todo-paper: #f0ebe0;
  --todo-ink: #2a2620;
  --todo-muted: #746e60;
  --todo-very-muted: #aaa393;
  --todo-line: rgba(60, 50, 40, .3);
  --todo-line-soft: rgba(60, 50, 40, .16);
  --todo-stamp: #a8362d;
  --todo-overdue: #b43e35;
  --todo-mono: "SF Mono", "JetBrains Mono", "Source Han Mono SC", "Consolas", monospace;
  --todo-serif: "Source Han Serif SC", "Songti SC", "STSong", Georgia, serif;
  --todo-torn-edge: polygon(
    0% 8px, 1.667% 0, 3.333% 8px, 5% 0, 6.667% 8px, 8.333% 0,
    10% 8px, 11.667% 0, 13.333% 8px, 15% 0, 16.667% 8px, 18.333% 0,
    20% 8px, 21.667% 0, 23.333% 8px, 25% 0, 26.667% 8px, 28.333% 0,
    30% 8px, 31.667% 0, 33.333% 8px, 35% 0, 36.667% 8px, 38.333% 0,
    40% 8px, 41.667% 0, 43.333% 8px, 45% 0, 46.667% 8px, 48.333% 0,
    50% 8px, 51.667% 0, 53.333% 8px, 55% 0, 56.667% 8px, 58.333% 0,
    60% 8px, 61.667% 0, 63.333% 8px, 65% 0, 66.667% 8px, 68.333% 0,
    70% 8px, 71.667% 0, 73.333% 8px, 75% 0, 76.667% 8px, 78.333% 0,
    80% 8px, 81.667% 0, 83.333% 8px, 85% 0, 86.667% 8px, 88.333% 0,
    90% 8px, 91.667% 0, 93.333% 8px, 95% 0, 96.667% 8px, 98.333% 0,
    100% 8px, 100% 100%, 0% 100%
  );
  min-height: 100dvh;
  width: 100%;
  max-width: 100vw;
  padding: max(16px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) max(44px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
  overflow-x: hidden;
  color: var(--todo-ink);
  background:
    radial-gradient(circle at 12% 0%, rgba(255, 250, 235, .24), transparent 34%),
    linear-gradient(180deg, #d7d0c3, #c8c0b2);
  font-family: var(--todo-mono);
}
.todo-page, .todo-page * { box-sizing: border-box; }
.page-toolbar, .todo-tabs, .receipt, .paper-panel { width: 100%; max-width: 680px; min-width: 0; margin-inline: auto; }
.receipt, .paper-panel {
  clip-path: var(--todo-torn-edge);
  background-color: var(--todo-paper);
  background-image:
    radial-gradient(ellipse at top, rgba(255, 250, 235, .12) 0%, transparent 55%),
    repeating-linear-gradient(90deg, rgba(60, 40, 20, .012) 0, rgba(60, 40, 20, .012) 1px, transparent 1px, transparent 2px);
}
.todo-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 18px; }
.todo-tabs button { display: grid; min-height: 52px; padding: 7px 5px; place-items: center; border: 1px solid var(--todo-line); border-radius: 5px; background: rgba(240, 235, 224, .72); color: var(--todo-muted); cursor: pointer; touch-action: manipulation; transition: background-color .18s ease, border-color .18s ease, color .18s ease; }
.todo-tabs button.active { border-color: var(--todo-stamp); background: var(--todo-paper); color: var(--todo-ink); box-shadow: 0 8px 18px rgba(55, 43, 30, .12); }
.todo-tabs span { font: 700 14px var(--todo-serif); }
.todo-tabs small { font-size: 8px; letter-spacing: .12em; }
.paper-panel { position: relative; min-height: 420px; padding: 38px 22px 28px; overflow: hidden; box-shadow: 0 18px 38px rgba(55, 43, 30, .18); }
.panel-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
.panel-heading > div:first-child { min-width: 0; }
.panel-heading h1 { margin: 4px 0 0; font: 700 clamp(26px, 7vw, 38px)/1.15 var(--todo-serif); }
.panel-heading__actions { display: flex; align-items: center; gap: 8px; }
.panel-add-button, .receipt__add-button { display: grid; width: 44px; height: 44px; flex: 0 0 44px; padding: 0; place-items: center; border: 1px solid var(--todo-line); border-radius: 50%; background: rgba(255, 252, 244, .6); color: var(--todo-ink); cursor: pointer; touch-action: manipulation; transition: background-color .18s ease, color .18s ease, transform .12s ease; }
.panel-add-button:hover, .receipt__add-button:hover { background: rgba(168, 54, 45, .08); color: var(--todo-stamp); }
.panel-add-button:active, .receipt__add-button:active { transform: scale(.96); }
.panel-add-button svg, .receipt__add-button svg { width: 21px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
.points-badge { display: grid; min-width: 76px; padding: 8px 10px; border: 1px dashed var(--todo-stamp); border-radius: 5px; color: var(--todo-stamp); text-align: center; }
.points-badge strong { font-size: 23px; font-variant-numeric: tabular-nums; }
.points-badge span { font-size: 10px; }
.panel-note { margin: 18px 0 0; overflow-wrap: anywhere; color: var(--todo-muted); font: italic 13px/1.7 var(--todo-serif); }
.calendar-toolbar { display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; margin: 20px 0 12px; text-align: center; }
.calendar-toolbar button { display: grid; width: 48px; height: 48px; padding: 0; place-items: center; border: 0; background: transparent; color: var(--todo-ink); cursor: pointer; }
.calendar-toolbar button:disabled { cursor: not-allowed; opacity: .3; }
.calendar-toolbar svg { width: 22px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
.home-calendar { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 5px; }
.home-calendar__weekday { padding: 5px 0; color: var(--todo-muted); font-size: 11px; text-align: center; }
.home-calendar__day { position: relative; display: flex; min-width: 0; min-height: 76px; padding: 7px 4px 16px; flex-direction: column; align-items: flex-start; gap: 2px; border: 1px solid transparent; border-radius: 5px; background: rgba(255, 252, 244, .38); color: var(--todo-ink); text-align: left; cursor: pointer; overflow: hidden; }
.home-calendar__day.completed { border-color: var(--todo-line-soft); background: rgba(168, 54, 45, .055); }
.home-calendar__day.today { border-color: var(--todo-ink); }
.home-calendar__day.empty { visibility: hidden; }
.home-calendar__number { font-size: 13px; font-variant-numeric: tabular-nums; }
.home-calendar__mark, .home-calendar__more { display: block; width: 100%; overflow: hidden; color: var(--todo-muted); font-size: 8px; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.home-calendar__paid { position: absolute; top: 3px; right: 3px; padding: 2px 3px; border: 1px solid var(--todo-stamp); border-radius: 2px; color: var(--todo-stamp); font: 700 7px/1.2 var(--todo-mono); letter-spacing: .08em; transform: rotate(-6deg); }
.home-calendar__points { position: absolute; right: 4px; bottom: 3px; color: var(--todo-stamp); font-size: 8px; font-weight: 800; }
.page-toolbar { display: grid; grid-template-columns: 48px minmax(0, 1fr) 48px; gap: 12px; align-items: center; padding: 2px 0 18px; }
.toolbar-title { display: grid; gap: 3px; min-width: 0; text-align: center; }
.toolbar-title > span { font-family: var(--todo-serif); font-size: 20px; font-weight: 700; letter-spacing: .08em; }
.toolbar-title small { overflow: hidden; color: #5f594e; font-size: 10px; letter-spacing: .08em; text-overflow: ellipsis; white-space: nowrap; }
.eyebrow { color: var(--todo-stamp); font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.icon-button { display: grid; width: 48px; height: 48px; padding: 0; place-items: center; border: 1px solid rgba(60, 50, 40, .25); border-radius: 8px; background: rgba(240, 235, 224, .92); color: var(--todo-ink); cursor: pointer; touch-action: manipulation; transition: background-color .18s ease, transform .12s ease, opacity .18s ease; }
.icon-button:hover { background: #f8f3e9; }
.icon-button:active { transform: scale(.96); }
.icon-button:disabled { cursor: wait; opacity: .5; }
.icon-button svg, .composer__title > svg { width: 23px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.8; }
button:focus-visible, a:focus-visible, input:focus-visible, label:has(input:focus-visible) { outline: 3px solid #8f5b50; outline-offset: 3px; }

.receipt { position: relative; padding: 42px 22px 26px; box-shadow: 0 18px 38px rgba(55, 43, 30, .22); }
.receipt__head { margin-bottom: 10px; text-align: center; }
.receipt__brand { margin: 0; color: var(--todo-muted); font-size: 10px; font-weight: 700; letter-spacing: .23em; }
.receipt__head h1 { margin: 5px 0 0; overflow: hidden; font-family: var(--todo-serif); font-size: clamp(24px, 7.2vw, 38px); font-style: italic; line-height: 1.1; letter-spacing: .01em; text-overflow: clip; white-space: nowrap; }
.receipt__date { margin: 7px 0 0; color: var(--todo-muted); font-size: 11px; letter-spacing: .16em; }
.receipt__dashes { overflow: hidden; padding: 5px 0; color: var(--todo-line); font-size: 11px; letter-spacing: .06em; line-height: 1; white-space: nowrap; user-select: none; }
.receipt__meta p, .receipt__summary > p { display: flex; justify-content: space-between; gap: 14px; margin: 0; padding: 3px 0; font-size: 12px; letter-spacing: .03em; }
.receipt__meta span:last-child, .receipt__summary span:last-child { font-variant-numeric: tabular-nums; text-align: right; }
.receipt__section-bar { display: flex; min-height: 44px; align-items: center; justify-content: center; gap: 4px; }
.receipt__section-label { margin: 0; padding: 5px 0; color: var(--todo-muted); font-size: 11px; font-weight: 700; letter-spacing: .18em; text-align: center; }
.receipt__add-button { border-color: transparent; background: transparent; }
.ticket-section { padding-top: 12px; }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding-bottom: 4px; }
.section-heading h2 { margin: 0; color: var(--todo-muted); font-size: 10px; letter-spacing: .1em; }
.section-heading small { color: var(--todo-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
:deep(.todo-row) { display: grid; grid-template-columns: 44px auto minmax(0, 1fr) auto; gap: 6px; align-items: center; min-height: 58px; border-bottom: .5px dashed var(--todo-line-soft); }
:deep(.todo-row--done .todo-row__body strong) { color: var(--todo-very-muted); text-decoration: line-through; text-decoration-color: var(--todo-muted); text-decoration-thickness: 1px; }
:deep(.todo-row--overdue) { background: linear-gradient(90deg, rgba(168, 54, 45, .07), transparent); }
:deep(.check-button), :deep(.row-actions button), .month-picker button { display: grid; min-width: 44px; min-height: 44px; padding: 0; place-items: center; border: 0; background: transparent; color: var(--todo-muted); cursor: pointer; touch-action: manipulation; transition: color .15s ease, transform .12s ease, opacity .15s ease; }
:deep(.check-button) { color: var(--todo-ink); font: 700 14px/1 var(--todo-mono); letter-spacing: -.06em; }
:deep(.check-button:active), :deep(.row-actions button:active), .month-picker button:active { transform: scale(.9); }
:deep(.check-button:disabled), :deep(.row-actions button:disabled) { cursor: wait; opacity: .45; }
:deep(.checklist-trigger) { min-width: 39px; padding: 2px 4px; border: .5px solid var(--todo-line-soft); border-radius: 3px; color: var(--todo-stamp); font-size: 10px; font-variant-numeric: tabular-nums; line-height: 1.45; text-align: center; }
:deep(.checklist-trigger--overdue) { border-color: rgba(180, 62, 53, .36); color: var(--todo-overdue); font-weight: 700; }
:deep(.todo-row__body) { min-width: 0; padding: 8px 0; }
:deep(.todo-row__body strong) { display: block; overflow-wrap: anywhere; font-size: 13.5px; font-weight: 500; line-height: 1.45; }
:deep(.todo-row__meta) { display: flex; flex-wrap: wrap; gap: 3px 8px; margin-top: 3px; color: var(--todo-muted); font-family: var(--todo-serif); font-size: 10.5px; font-style: italic; }
:deep(.overdue-label) { color: var(--todo-overdue); font-family: var(--todo-mono); font-style: normal; font-weight: 700; }
:deep(.row-actions) { display: flex; }
:deep(.row-actions svg), .month-picker svg { width: 19px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
:deep(.archive-button) { font: 22px/1 var(--todo-mono); }
:deep(.row-actions button:hover) { color: var(--todo-stamp); }
.receipt__summary { margin-top: 14px; }
.receipt__summary .faded { color: var(--todo-muted); }
.receipt__progress { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 0 4px; font-size: 11px; }
.receipt__progress span:nth-child(2) { overflow: hidden; letter-spacing: -.03em; white-space: nowrap; }
.receipt__progress strong { color: var(--todo-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.receipt__stamp { width: fit-content; margin: 10px auto 0; padding: 6px 13px; border: 2px solid var(--todo-muted); border-radius: 4px; color: var(--todo-muted); font-family: var(--todo-serif); font-size: 13px; font-style: italic; font-weight: 700; letter-spacing: .12em; opacity: .72; transform: rotate(-3deg); }
.receipt__stamp--paid { border-color: var(--todo-stamp); color: var(--todo-stamp); opacity: .86; }
.receipt__note { margin: 12px 8px 0; color: var(--todo-muted); font-family: var(--todo-serif); font-size: 12px; font-style: italic; line-height: 1.65; text-align: center; }
.receipt__barcode { width: 70%; max-width: 280px; height: 34px; margin: 11px auto 0; background: repeating-linear-gradient(90deg, var(--todo-ink) 0 1px, transparent 1px 3px, var(--todo-ink) 3px 5px, transparent 5px 7px, var(--todo-ink) 7px 8px, transparent 8px 12px); opacity: .78; }
.receipt__barcode-serial { margin: 3px 0 0; color: var(--todo-muted); font-size: 9px; letter-spacing: .18em; text-align: center; }
.receipt__footer { display: flex; justify-content: center; gap: 9px; margin-top: 11px; color: var(--todo-muted); font-size: 9px; letter-spacing: .14em; }
.empty-state { padding: 42px 16px 24px; text-align: center; }
.empty-state svg { width: 48px; fill: none; stroke: var(--todo-muted); stroke-width: 1.3; }
.empty-state h2 { margin: 12px 0 6px; font: 600 20px/1.3 var(--todo-serif); }
.empty-state p { margin: 0; color: var(--todo-muted); line-height: 1.6; }

.composer { position: relative; padding: 0; }
.composer--sheet { width: min(100%, 620px); margin: auto; }
.composer__title { display: flex; align-items: center; justify-content: space-between; }
.composer h2, .sheet-header h2 { margin: 4px 0; font-family: var(--todo-serif); }
.composer h2 { font-size: 24px; }
.composer form { display: grid; gap: 10px; margin-top: 16px; }
.composer label, .composer legend { font-size: 12px; font-weight: 700; }
.composer input[type="text"], .composer input[type="time"], .reward-form input { width: 100%; min-height: 48px; padding: 0 12px; border: 1px solid var(--todo-line); border-radius: 4px; background: rgba(255, 252, 244, .8); color: var(--todo-ink); font: 15px var(--todo-mono); }
.composer fieldset { min-width: 0; margin: 6px 0; padding: 0; border: 0; }
.composer legend { margin-bottom: 8px; }
.segmented { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.segmented label { display: grid; min-height: 48px; place-items: center; border: 1px solid var(--todo-line); border-radius: 4px; background: rgba(255, 252, 244, .72); color: var(--todo-muted); cursor: pointer; touch-action: manipulation; transition: background-color .18s ease, border-color .18s ease; }
.segmented label.active { border-color: var(--todo-stamp); background: rgba(168, 54, 45, .07); color: var(--todo-ink); }
.segmented input { position: absolute; opacity: 0; pointer-events: none; }
.points-fieldset { min-width: 0; margin: 6px 0; padding: 0; border: 0; }
.point-options { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; }
.point-options label { display: grid; min-height: 44px; place-items: center; border: 1px solid var(--todo-line); border-radius: 4px; background: rgba(255, 252, 244, .72); color: var(--todo-muted); cursor: pointer; }
.point-options label.active { border-color: var(--todo-stamp); color: var(--todo-stamp); }
.point-options input { position: absolute; opacity: 0; pointer-events: none; }
.reminder-toggle { display: flex; min-height: 64px; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 12px; border: 1px dashed var(--todo-line); border-radius: 4px; background: rgba(255, 252, 244, .46); }
.reminder-toggle span { display: grid; gap: 3px; }
.reminder-toggle small { color: var(--todo-muted); font-weight: 400; line-height: 1.4; }
.reminder-toggle input { width: 24px; height: 24px; accent-color: var(--todo-stamp); }
.primary-button { min-height: 50px; margin-top: 4px; border: 1px solid var(--todo-ink); border-radius: 4px; background: var(--todo-ink); color: var(--todo-paper); font: 700 13px var(--todo-mono); letter-spacing: .08em; cursor: pointer; touch-action: manipulation; transition: background-color .18s ease, transform .12s ease, opacity .18s ease; }
.primary-button:hover { background: #443d33; }
.primary-button:active { transform: scale(.985); }
.primary-button:disabled { cursor: not-allowed; opacity: .48; }
.secondary-button { min-height: 48px; border: 1px solid var(--todo-line); border-radius: 4px; background: transparent; color: var(--todo-muted); cursor: pointer; }
.spinner { display: inline-block; width: 16px; height: 16px; margin-right: 8px; border: 2px solid rgba(255,255,255,.4); border-top-color: white; border-radius: 50%; vertical-align: -3px; animation: spin .7s linear infinite; }
.form-error { margin: 0; color: var(--todo-overdue); font-size: 13px; line-height: 1.5; }
.loading-state { padding: 42px 0; color: var(--todo-muted); }
.message-card { display: grid; grid-template-columns: 32px 1fr auto; gap: 12px; align-items: center; padding: 18px 0; }
.message-card svg { width: 28px; fill: none; stroke: var(--todo-overdue); stroke-width: 1.8; }
.message-card p { margin: 4px 0 0; color: var(--todo-muted); line-height: 1.5; }
.message-card button { min-width: 64px; min-height: 44px; border: 1px solid var(--todo-line); border-radius: 4px; background: rgba(255, 252, 244, .78); cursor: pointer; }
.sr-live { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }

.reward-list { display: grid; margin-top: 20px; border-top: 1px dashed var(--todo-line-soft); }
.reward-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px 18px; align-items: center; padding: 16px 0; border-bottom: 1px dashed var(--todo-line-soft); }
.reward-card--obtained { opacity: .72; }
.reward-card__copy { min-width: 0; }
.reward-title-row { display: flex; min-width: 0; align-items: center; flex-wrap: wrap; }
.reward-card h2 { min-width: 0; margin: 0 8px 0 0; overflow-wrap: anywhere; font: 700 18px/1.35 var(--todo-serif); }
.reward-card p { margin: 2px 0 0; overflow-wrap: anywhere; color: var(--todo-muted); font: 12px/1.6 var(--todo-serif); }
.reward-status { margin-left: 4px; color: var(--todo-muted); font-size: 8px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.reward-edit-button { display: grid; width: 44px; height: 44px; flex: 0 0 44px; padding: 0; place-items: center start; border: 0; background: transparent; color: var(--todo-muted); cursor: pointer; touch-action: manipulation; transition: color .18s ease, opacity .18s ease; }
.reward-edit-button:hover { color: var(--todo-stamp); }
.reward-edit-button:disabled { cursor: wait; opacity: .35; }
.reward-edit-button svg { width: 18px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.7; }
.reward-controls { display: grid; grid-template-columns: minmax(84px, auto) minmax(94px, auto) 44px; gap: 10px; align-items: center; }
.reward-cost { min-height: 44px; padding: 0 12px; border: 1px solid rgba(168, 54, 45, .38); border-radius: 7px; color: var(--todo-stamp); font-size: 11px; font-weight: 500; line-height: 42px; text-align: center; white-space: nowrap; }
.reward-cost span { margin-right: 2px; font: 700 18px/1 var(--todo-serif); }
.reward-redeem-button { min-width: 94px; min-height: 44px; padding: 0 16px; border: 1px solid var(--todo-stamp); border-radius: 7px; background: var(--todo-stamp); color: #fffaf3; font: 700 13px var(--todo-serif); letter-spacing: .08em; cursor: pointer; touch-action: manipulation; transition: filter .18s ease, opacity .18s ease, transform .12s ease; }
.reward-redeem-button:hover { filter: brightness(1.06); }
.reward-redeem-button:active { transform: scale(.98); }
.reward-redeem-button:disabled { border-color: var(--todo-line-soft); background: rgba(116, 110, 96, .12); color: var(--todo-very-muted); cursor: not-allowed; opacity: 1; }
.reward-obtained { display: grid; min-width: 94px; min-height: 44px; padding: 0 12px; place-items: center; border: 1px solid var(--todo-line-soft); border-radius: 7px; color: var(--todo-muted); font: 700 12px var(--todo-serif); }
.reward-archive-button { display: grid; width: 44px; height: 44px; padding: 0; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--todo-very-muted); cursor: pointer; touch-action: manipulation; transition: background-color .18s ease, color .18s ease, opacity .18s ease; }
.reward-archive-button:hover { background: rgba(116, 110, 96, .08); color: var(--todo-muted); }
.reward-archive-button:disabled { cursor: wait; opacity: .35; }
.reward-archive-button svg { width: 18px; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.6; }
.archived-rewards { margin-top: 22px; border-top: 1px dashed var(--todo-line); color: var(--todo-muted); }
.archived-rewards summary { display: flex; min-height: 48px; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; touch-action: manipulation; }
.archived-rewards summary::marker { color: var(--todo-stamp); }
.archived-rewards summary strong { display: grid; min-width: 28px; min-height: 28px; place-items: center; border: 1px solid var(--todo-line-soft); border-radius: 50%; font-size: 11px; font-variant-numeric: tabular-nums; }
.archived-reward-list { border-top: 1px dashed var(--todo-line-soft); }
.archived-reward-list article { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px dashed var(--todo-line-soft); }
.archived-reward-list h2 { margin: 0; overflow-wrap: anywhere; color: var(--todo-muted); font: 700 15px/1.4 var(--todo-serif); }
.archived-reward-list p { margin: 3px 0 0; overflow-wrap: anywhere; color: var(--todo-very-muted); font: 11px/1.5 var(--todo-serif); }
.archived-reward-list button { min-width: 72px; min-height: 44px; padding: 0 14px; border: 1px solid var(--todo-line); border-radius: 7px; background: transparent; color: var(--todo-muted); cursor: pointer; touch-action: manipulation; transition: background-color .18s ease, color .18s ease, opacity .18s ease; }
.archived-reward-list button:hover { background: rgba(168, 54, 45, .07); color: var(--todo-stamp); }
.archived-reward-list button:disabled { cursor: wait; opacity: .35; }
.reward-empty { padding: 28px 10px; color: var(--todo-muted); font: italic 14px/1.6 var(--todo-serif); text-align: center; }
.rewards-panel { clip-path: none; border-radius: 22px; }
.reward-form { display: grid; gap: 9px; margin-top: 16px; }
.reward-form h2 { margin: 2px 0 8px; font: 700 22px var(--todo-serif); }
.reward-form label { font-size: 12px; font-weight: 700; }
.reward-composer { width: min(100%, 620px); margin: auto; }
.reward-composer h2 { margin: 4px 0; font: 700 24px var(--todo-serif); }
.day-summary { display: flex; justify-content: space-between; gap: 12px; margin: 18px 0 10px; padding: 12px; border-block: 1px dashed var(--todo-line); }
.day-summary strong { color: var(--todo-stamp); }
.day-list { margin: 0; padding: 0; list-style: none; }
.day-list li { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; gap: 7px; align-items: center; min-height: 58px; border-bottom: 1px dashed var(--todo-line-soft); }
.day-list li > span { font-weight: 800; }
.day-list strong, .day-list small { display: block; overflow-wrap: anywhere; }
.day-list small { margin-top: 3px; color: var(--todo-muted); font-size: 10px; }
.day-list b { color: var(--todo-stamp); font-size: 11px; }

.month-sheet, .form-sheet { max-height: min(88dvh, 760px); overflow-y: auto; padding: 22px max(18px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left)); color: var(--todo-ink); background: var(--todo-paper); font-family: var(--todo-mono); }
.month-sheet section { width: min(100%, 620px); margin: auto; }
.sheet-header { display: grid; grid-template-columns: minmax(0, 1fr) 48px; gap: 12px; align-items: start; }
.sheet-header h2 { overflow-wrap: anywhere; font-size: 25px; }
.month-picker { display: grid; grid-template-columns: 48px 1fr 48px; align-items: center; margin: 18px 0; text-align: center; }
.month-picker button:disabled { opacity: .3; cursor: not-allowed; }
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stats-grid article { padding: 14px 10px; border: 1px dashed var(--todo-line); border-radius: 4px; background: rgba(255, 252, 244, .5); text-align: center; }
.stats-grid span { display: block; color: var(--todo-muted); font-size: 12px; }
.stats-grid strong { display: inline-block; margin-top: 5px; font-size: 25px; font-variant-numeric: tabular-nums; }
.stats-grid small { margin-left: 3px; color: var(--todo-muted); }
.calendar { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; margin-top: 18px; }
.calendar__weekday { padding: 5px 0; color: var(--todo-muted); font-size: 12px; text-align: center; }
.calendar__day { position: relative; display: grid; min-height: 44px; place-items: center; border: 1px solid transparent; border-radius: 4px; font-size: 13px; font-variant-numeric: tabular-nums; }
.calendar__day.completed { border-color: rgba(168, 54, 45, .45); background: rgba(168, 54, 45, .08); color: var(--todo-stamp); font-weight: 800; }
.calendar__day.today { border-color: var(--todo-ink); }
.calendar__day.empty { visibility: hidden; }
.calendar__day svg { position: absolute; right: 2px; bottom: 2px; width: 13px; fill: none; stroke: currentColor; stroke-width: 2.4; }
.sheet-note { margin: 16px 0 0; color: var(--todo-muted); font-size: 13px; line-height: 1.6; }
.sheet-note--intro { margin-top: 10px; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 430px) {
  .todo-page { padding-inline: 10px; }
  .page-toolbar { grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 8px; }
  .icon-button { width: 44px; height: 44px; }
  .receipt { padding-inline: 15px; }
  .paper-panel { padding-inline: 15px; }
  .reward-card { grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .reward-controls { grid-template-columns: minmax(82px, 1fr) minmax(94px, 1.1fr) 44px; gap: 8px; }
  :deep(.todo-row) { grid-template-columns: 44px auto minmax(0, 1fr) 44px; gap: 4px; }
  :deep(.row-actions) { flex-direction: column; }
  .stats-grid article { padding-inline: 5px; }
}
@media (max-width: 375px) {
  .toolbar-title small { display: none; }
  .receipt { padding-inline: 12px; }
  :deep(.todo-row) { grid-template-columns: 42px 38px minmax(0, 1fr) 44px; gap: 2px; }
  :deep(.checklist-trigger) { min-width: 36px; padding-inline: 2px; }
  .segmented { grid-template-columns: 1fr; }
  .home-calendar { gap: 3px; }
  .home-calendar__day { min-height: 68px; padding-inline: 3px; }
  .home-calendar__mark { font-size: 7.5px; }
  .stats-grid strong { font-size: 21px; }
}
@media (orientation: landscape) and (max-height: 520px) {
  .month-sheet, .form-sheet { max-height: 96dvh; }
}
@media (prefers-color-scheme: dark) {
  .todo-page {
    --todo-paper: #2d2923;
    --todo-ink: #eee7dc;
    --todo-muted: #c0b7a7;
    --todo-very-muted: #8d8578;
    --todo-line: rgba(232, 220, 202, .34);
    --todo-line-soft: rgba(232, 220, 202, .18);
    --todo-stamp: #e58476;
    --todo-overdue: #f09487;
    background: radial-gradient(circle at 12% 0%, #51493e 0, transparent 34%), #211e1a;
  }
  .toolbar-title small { color: var(--todo-muted); }
  .icon-button, .todo-tabs button, .receipt, .paper-panel, .month-sheet, .form-sheet { border-color: var(--todo-line); background-color: var(--todo-paper); color: var(--todo-ink); }
  .icon-button:hover { background: #3a342d; }
  :deep(.todo-row--overdue) { background: linear-gradient(90deg, rgba(229, 132, 118, .14), transparent); }
  .composer input[type="text"], .composer input[type="time"], .reward-form input, .segmented label, .point-options label, .message-card button {
    border-color: var(--todo-line);
    background: #25211d;
    color: var(--todo-ink);
  }
  .segmented label.active, .stats-grid article { border-color: var(--todo-stamp); background: rgba(229, 132, 118, .1); color: var(--todo-ink); }
  .reminder-toggle { border-color: var(--todo-line); background: #29251f; }
  .calendar__day.completed { border-color: var(--todo-stamp); background: rgba(229, 132, 118, .12); color: var(--todo-stamp); }
  .home-calendar__day, .reward-card { background: rgba(255, 255, 255, .025); }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition: none !important; animation: none !important; }
}
</style>
