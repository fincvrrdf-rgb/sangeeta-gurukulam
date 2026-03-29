/**
 * Learning Resources — /student/resources
 *
 * Lists resources uploaded by the teacher.
 * Supports filtering by type (PDF / Video / Link / Other).
 * Fetches from Firestore resources collection directly.
 */

'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { COLLECTIONS } from '@/domain/constants';
import { useAuthContext } from '@/components/layout/AuthProvider';

interface Resource {
  id: string;
  title: string;
  description: string;
  mimeType: string;
  fileSizeBytes: number;
  category: string;
  linkedTeachingUnitId: string | null;
  visibility: string;
  storageRef: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
}

type FilterType = 'all' | 'pdf' | 'video' | 'link' | 'audio' | 'other';

const FILTER_LABELS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pdf', label: 'PDF' },
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
  { key: 'link', label: 'Link' },
  { key: 'other', label: 'Other' },
];

function getResourceType(mimeType: string, category?: string): FilterType {
  if (!mimeType && category === 'link') return 'link';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (category === 'link') return 'link';
  return 'other';
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TypeBadge({ type }: { type: FilterType }) {
  const configs: Record<FilterType, { cls: string; label: string; icon: string }> = {
    pdf: { cls: 'badge-error', label: 'PDF', icon: '&#x1F4C4;' },
    video: { cls: 'badge-info', label: 'Video', icon: '&#x1F3AC;' },
    audio: { cls: 'badge-warning', label: 'Audio', icon: '&#x1F3B5;' },
    link: { cls: 'badge-success', label: 'Link', icon: '&#x1F517;' },
    other: { cls: 'badge-neutral', label: 'File', icon: '&#x1F4CE;' },
    all: { cls: 'badge-neutral', label: 'File', icon: '&#x1F4CE;' },
  };
  const { cls, label, icon } = configs[type] ?? configs.other;
  return (
    <span
      className={`badge ${cls}`}
      dangerouslySetInnerHTML={{ __html: `${icon} ${label}` }}
    />
  );
}

function ResourceCard({ resource }: { resource: Resource }) {
  const type = getResourceType(resource.mimeType, resource.category);
  const hasDownload = type !== 'link' && resource.storageRef;

  return (
    <div className="card space-y-3 hover:shadow-md transition-shadow duration-150">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-charcoal text-sm leading-snug">
            {resource.title}
          </p>
          {resource.fileName && resource.fileName !== resource.title && (
            <p className="text-xs text-gray-400 mt-0.5 truncate">{resource.fileName}</p>
          )}
        </div>
        <TypeBadge type={type} />
      </div>

      {/* Description */}
      {resource.description && (
        <p className="text-sm text-gray-600 leading-relaxed">{resource.description}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-400">
          {resource.fileSizeBytes ? formatFileSize(resource.fileSizeBytes) : ''}
          {resource.category && resource.category !== 'link'
            ? ` \u2022 ${resource.category}`
            : ''}
        </span>

        {hasDownload ? (
          <a
            href={resource.storageRef}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs px-3 py-1.5"
          >
            &#x2B73; Download
          </a>
        ) : type === 'link' && resource.storageRef ? (
          <a
            href={resource.storageRef}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs px-3 py-1.5"
          >
            &#x1F517; Open Link
          </a>
        ) : null}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="card animate-pulse space-y-3">
      <div className="flex justify-between">
        <div className="h-4 w-48 bg-gray-200 rounded" />
        <div className="h-5 w-12 bg-gray-200 rounded-full" />
      </div>
      <div className="h-3 w-full bg-gray-200 rounded" />
      <div className="h-3 w-2/3 bg-gray-200 rounded" />
    </div>
  );
}

export default function ResourcesPage() {
  const { user } = useAuthContext();

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');

  useEffect(() => {
    if (!user) return;

    async function load() {
      try {
        // Fetch resources visible to students (visibility: 'all_students' or 'public')
        const q = query(
          collection(db, COLLECTIONS.RESOURCES),
          where('visibility', 'in', ['all_students', 'public']),
          orderBy('createdAt', 'desc'),
        );
        const snap = await getDocs(q);
        const items: Resource[] = snap.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Resource, 'id'>),
        }));
        setResources(items);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Could not load resources.',
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [user]);

  const filtered =
    activeFilter === 'all'
      ? resources
      : resources.filter(
          (r) => getResourceType(r.mimeType, r.category) === activeFilter,
        );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-charcoal">
          Learning Resources
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Materials shared by your teacher for your practice.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        {FILTER_LABELS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFilter(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              activeFilter === key
                ? 'bg-saffron-600 text-white border-saffron-600'
                : 'bg-white text-charcoal border-gray-300 hover:border-saffron-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-800">
          &#9888;&#65039; {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filtered.length === 0 && (
        <div className="card text-center py-16 space-y-3">
          <p className="text-3xl">&#x1F4DA;</p>
          <p className="font-semibold text-charcoal">
            {activeFilter === 'all'
              ? 'No resources yet'
              : `No ${activeFilter.toUpperCase()} resources`}
          </p>
          <p className="text-sm text-gray-500 max-w-xs mx-auto">
            {activeFilter === 'all'
              ? 'Your teacher will upload practice materials here.'
              : 'Try a different filter to see other resources.'}
          </p>
          {activeFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setActiveFilter('all')}
              className="btn-secondary inline-flex mt-2 text-sm"
            >
              Show All
            </button>
          )}
        </div>
      )}

      {/* Resource grid */}
      {!loading && filtered.length > 0 && (
        <>
          <p className="text-xs text-gray-400">
            {filtered.length} resource{filtered.length !== 1 ? 's' : ''}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
