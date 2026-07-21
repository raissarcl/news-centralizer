import { create } from 'zustand';
import type { TimelineFilter, TimelinePeriod } from '../types';

type TimelineUiState = {
  timelineFilter: TimelineFilter;
  timelinePeriod: TimelinePeriod;
  searchQuery: string;
  selectedTagId: string | null;
  selectedFolderId: string | null;
  selectedFeedIds: string[];
  setTimelineFilter: (filter: TimelineFilter) => void;
  setTimelinePeriod: (period: TimelinePeriod) => void;
  setSearchQuery: (query: string) => void;
  setSelectedTagId: (tagId: string | null) => void;
  setSelectedFolderId: (folderId: string | null) => void;
  setSelectedFeedIds: (feedIds: string[]) => void;
  resetTimelineFilters: () => void;
};

const INITIAL_FILTERS = {
  timelineFilter: 'all' as TimelineFilter,
  timelinePeriod: 'all' as TimelinePeriod,
  searchQuery: '',
  selectedTagId: null as string | null,
  selectedFolderId: null as string | null,
  selectedFeedIds: [] as string[],
};

export const useTimelineUiStore = create<TimelineUiState>((set) => ({
  ...INITIAL_FILTERS,
  setTimelineFilter: (filter) => set({ timelineFilter: filter }),
  setTimelinePeriod: (period) => set({ timelinePeriod: period }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedTagId: (tagId) => set({ selectedTagId: tagId }),
  setSelectedFolderId: (folderId) => set({ selectedFolderId: folderId }),
  setSelectedFeedIds: (feedIds) => set({ selectedFeedIds: feedIds }),
  resetTimelineFilters: () => set({ ...INITIAL_FILTERS }),
}));
