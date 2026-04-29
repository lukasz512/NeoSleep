<!--
  TEMPLATE: Entity Detail View — HCP / Patient / Lead
  ──────────────────────────────────────────────────────
  Key patterns shown here:
    1. VToolbar: back button left, action buttons right
    2. VCard identity header: avatar initials + prefix + name + subtitle
    3. VTabs + VWindow: sections without page navigation
    4. Loading → skeleton, Error → alert+retry, then content
    5. All strings in $t(), no custom CSS classes
-->
<template>
  <VContainer fluid>

    <!-- Toolbar: back + actions -->
    <VToolbar flat color="transparent">
      <VBtn icon="mdi-arrow-left" @click="router.back()" />
      <VToolbarTitle>{{ $t('TODO.detail.title') }}</VToolbarTitle>
      <template #append>
        <VBtn
          color="primary" variant="tonal" prepend-icon="mdi-calendar-plus"
          @click="logVisit"
        >
          {{ $t('TODO.detail.logVisit') }}
        </VBtn>
        <VBtn icon="mdi-dots-vertical" @click="menuOpen = true" />
      </template>
    </VToolbar>

    <!-- Loading -->
    <template v-if="loading">
      <VSkeletonLoader type="card" rounded="xl" class="mb-4" />
      <VSkeletonLoader type="paragraph" rounded="xl" />
    </template>

    <!-- Error -->
    <VAlert v-else-if="error" type="error" variant="tonal" rounded="xl">
      {{ $t('common.loadError') }}
      <template #append>
        <VBtn variant="text" @click="load">{{ $t('common.retry') }}</VBtn>
      </template>
    </VAlert>

    <!-- Content -->
    <template v-else-if="item">

      <!-- Identity header card -->
      <VCard rounded="xl" class="mb-4">
        <VCardText>
          <div class="d-flex align-center ga-4">
            <VAvatar color="primary" size="64">
              <span class="text-h6 font-weight-bold text-white">{{ initials(item.firstName, item.lastName) }}</span>
            </VAvatar>
            <div class="flex-1-1">
              <div class="text-h6 font-weight-bold">
                <span v-if="item.prefix" class="text-medium-emphasis">{{ item.prefix }} </span>
                {{ item.firstName }} {{ item.lastName }}
              </div>
              <div class="text-body-2 text-medium-emphasis">{{ item.specialty }}</div>
              <div class="d-flex ga-2 mt-2 flex-wrap">
                <VChip
                  :color="statusColor(item.visitStatus)" size="x-small" variant="tonal"
                >
                  {{ $t(`TODO.visitStatus.${item.visitStatus}`) }}
                </VChip>
                <VChip size="x-small" variant="outlined" prepend-icon="mdi-map-marker">
                  {{ item.territoryCode }}
                </VChip>
                <VChip v-if="item.hcoName" size="x-small" variant="outlined" prepend-icon="mdi-hospital-building">
                  {{ item.hcoName }}
                </VChip>
              </div>
            </div>
          </div>
        </VCardText>

        <!-- Quick contact actions -->
        <VCardActions class="px-4 pb-4 ga-2">
          <VBtn
            v-if="item.phone" variant="tonal" size="small"
            prepend-icon="mdi-phone" :href="`tel:${item.phone}`"
          >
            {{ item.phone }}
          </VBtn>
          <VBtn
            v-if="item.email" variant="tonal" size="small"
            prepend-icon="mdi-email" :href="`mailto:${item.email}`"
          >
            {{ $t('common.email') }}
          </VBtn>
        </VCardActions>
      </VCard>

      <!-- Tabs: Overview / Visits / Notes -->
      <VTabs v-model="tab" color="primary" class="mb-4">
        <VTab value="overview" prepend-icon="mdi-account">{{ $t('TODO.tabs.overview') }}</VTab>
        <VTab value="visits"   prepend-icon="mdi-calendar-check">{{ $t('TODO.tabs.visits') }}</VTab>
        <VTab value="notes"    prepend-icon="mdi-note-text">{{ $t('TODO.tabs.notes') }}</VTab>
      </VTabs>

      <VWindow v-model="tab">

        <!-- Overview -->
        <VWindowItem value="overview">
          <VCard rounded="xl">
            <VList lines="one" density="compact">
              <VListItem
                v-for="field in overviewFields" :key="field.label"
                :title="$t(field.label)" :subtitle="field.value ?? '—'"
              />
            </VList>
          </VCard>
        </VWindowItem>

        <!-- Visits -->
        <VWindowItem value="visits">
          <VList v-if="item.encounters?.length" rounded="xl" bg-color="surface">
            <VListItem
              v-for="enc in item.encounters" :key="enc.id"
              :title="formatDate(enc.date)" :subtitle="enc.summary"
              prepend-icon="mdi-calendar-check" rounded="xl" class="mb-1"
            >
              <template #append>
                <VChip :color="outcomeColor(enc.outcome)" size="x-small" variant="tonal">
                  {{ $t(`TODO.outcome.${enc.outcome}`) }}
                </VChip>
              </template>
            </VListItem>
          </VList>
          <VEmptyState
            v-else :title="$t('TODO.visits.empty.title')" :text="$t('TODO.visits.empty.text')"
            icon="mdi-calendar-blank"
          >
            <template #actions>
              <VBtn @click="logVisit">{{ $t('TODO.detail.logVisit') }}</VBtn>
            </template>
          </VEmptyState>
        </VWindowItem>

        <!-- Notes -->
        <VWindowItem value="notes">
          <VTextarea
            v-model="note" :label="$t('TODO.notes.placeholder')"
            variant="outlined" rounded="xl" rows="4" auto-grow class="mb-3"
          />
          <VBtn color="primary" :loading="savingNote" @click="saveNote">
            {{ $t('common.save') }}
          </VBtn>
        </VWindowItem>

      </VWindow>
    </template>

  </VContainer>
</template>

<script setup lang="ts">
// @ts-nocheck — template file, not compiled as part of the project
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute }      from 'vue-router'
import { useI18n }                  from 'vue-i18n'
import { useBffApi }                from '@/composables/useBffApi'

const router = useRouter()
const route  = useRoute()
const { t }  = useI18n()
const api    = useBffApi()

// Replace TODO with actual type from packages/shared/src/types/
const item      = ref<TODO | null>(null)
const loading   = ref(true)
const error     = ref(false)
const tab       = ref('overview')
const note      = ref('')
const savingNote = ref(false)
const menuOpen  = ref(false)

async function load() {
  loading.value = true; error.value = false
  try { item.value = (await api.get(`/TODO/${route.params.id}`)).data }
  catch { error.value = true }
  finally { loading.value = false }
}

// Derived field list for Overview tab — add/remove fields per entity
const overviewFields = computed(() => [
  { label: 'TODO.fields.specialty',  value: item.value?.specialty },
  { label: 'TODO.fields.territory',  value: item.value?.territoryCode },
  { label: 'TODO.fields.email',      value: item.value?.email },
  { label: 'TODO.fields.phone',      value: item.value?.phone },
  { label: 'TODO.fields.language',   value: item.value?.preferredLanguage },
])

async function logVisit()  { router.push(`/TODO/${route.params.id}/visit/new`) }
async function saveNote()  { /* POST /TODO/:id/notes */ }

const initials   = (first: string, last: string) => `${first[0]}${last[0]}`.toUpperCase()
const formatDate = (iso: string) => new Date(iso).toLocaleDateString()
const statusColor  = (s: string) => ({ new: 'info', scheduled: 'primary', visited: 'success', cold: 'default', missed: 'error' }[s] ?? 'default')
const outcomeColor = (o: string) => ({ positive: 'success', neutral: 'warning', negative: 'error' }[o] ?? 'default')

onMounted(load)
</script>
