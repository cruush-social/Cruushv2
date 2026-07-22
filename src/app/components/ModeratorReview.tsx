import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ApiClientError, resolveMediaUrl } from '../lib/apiClient';
import {
  changeModeratedAccountStatus,
  decideContentReview,
  getModerationQueue,
  getModerationQueueItem,
  moderateReport,
  removeReportedContent,
  type ModeratedAccountStatus,
  type ModerationActionReceipt,
  type ModerationContentContext,
  type ModerationQueueDetail,
  type ModerationQueueItem,
  type ModerationQueueSource,
  type ModerationQueueState,
} from '../lib/moderationApi';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

type AccessState = 'checking' | 'ready' | 'denied' | 'error';
type ActionDialogState =
  | { kind: 'report'; status: 'resolved' | 'dismissed' }
  | { kind: 'review'; action: 'approve' | 'reject' }
  | { kind: 'remove' }
  | { kind: 'account'; status: ModeratedAccountStatus };

const PAGE_SIZE = 25;

const reasonLabels: Record<string, string> = {
  non_consensual_imagery: 'Non-consensual imagery',
  minor_safety: 'Underage user concern',
  impersonation: 'Impersonation',
  coercion_trafficking: 'Coercion or trafficking',
  illegal_activity: 'Illegal activity',
  spam_scam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  fetishization: 'Fetishization',
  hate: 'Hate speech or discrimination',
  violence_threat: 'Threats or safety concern',
  privacy_location: 'Privacy or location exposure',
  other: 'Other',
};

const accountStatusLabels: Record<ModeratedAccountStatus, string> = {
  active: 'Active',
  under_review: 'Under review',
  suspended: 'Suspended',
};

const accountDescriptions: Record<ModeratedAccountStatus, string> = {
  active: 'Restore normal account access.',
  under_review: 'Block unsafe writes while preserving support and reporting access.',
  suspended: 'Revoke sessions and block sign-in and application access.',
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCode(value: string | null | undefined) {
  if (!value) return 'Moderation review';
  return reasonLabels[value] ?? value.replaceAll('_', ' ');
}

function isAccessDenied(error: unknown) {
  return error instanceof ApiClientError && (error.status === 401 || error.status === 403);
}

function sourceLabel(item: ModerationQueueItem) {
  return item.kind === 'report' ? 'User report' : 'Automod review';
}

function targetLabel(item: ModerationQueueItem) {
  return item.target.type.replaceAll('_', ' ');
}

function statusVariant(status: string) {
  if (['resolved', 'allowed'].includes(status)) return 'default' as const;
  if (['dismissed', 'blocked', 'removed'].includes(status)) return 'secondary' as const;
  return 'outline' as const;
}

function getDetailSubject(detail: ModerationQueueDetail | null) {
  if (!detail) return null;
  if (detail.item.kind === 'report') {
    return {
      userId: detail.item.report.target.userId,
      displayName: detail.item.report.target.displayName,
      accountStatus: detail.item.report.target.accountStatus ?? null,
      reportId: detail.item.report.id,
    };
  }
  return {
    userId: detail.item.review.user.id,
    displayName: detail.item.review.user.displayName,
    accountStatus: detail.item.review.user.accountStatus,
    reportId: null,
  };
}

function ContextView({ context }: { context: ModerationContentContext }) {
  if (context.kind === 'post' || context.kind === 'message') {
    return (
      <div className="space-y-2 rounded-lg border border-border bg-card/70 p-4">
        <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
          <span>{context.author ?? 'cruush user'}</span>
          {context.createdAt ? <span>{formatDateTime(context.createdAt)}</span> : null}
        </div>
        <p className="whitespace-pre-wrap text-sm">{context.text || 'No text retained.'}</p>
      </div>
    );
  }

  if (context.kind === 'conversation') {
    return (
      <div className="max-h-80 space-y-3 overflow-y-auto rounded-lg border border-border bg-card/70 p-4">
        {(context.messages ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No conversation messages remain available.</p>
        ) : (context.messages ?? []).map((message) => (
          <div key={message.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>{message.author}</span>
              <span>{formatDateTime(message.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{message.text}</p>
          </div>
        ))}
      </div>
    );
  }

  if (context.kind === 'profile') {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-card/70 p-4">
        <div>
          <p className="font-medium">{context.displayName}</p>
          <p className="text-xs text-muted-foreground">{(context.pronouns ?? []).join(', ') || 'No pronouns listed'}</p>
        </div>
        <p className="whitespace-pre-wrap text-sm">{context.bio || 'No profile bio.'}</p>
        {(context.photos ?? []).length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {(context.photos ?? []).slice(0, 4).map((photo) => (
              <img key={photo} src={resolveMediaUrl(photo)} alt="Profile moderation context" className="aspect-square rounded-md object-cover" />
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  if (context.kind === 'media') {
    return (
      <div className="rounded-lg border border-border bg-card/70 p-4">
        {context.previewUrl ? (
          <img
            src={resolveMediaUrl(context.previewUrl)}
            alt="Moderator-only content preview"
            className="mx-auto max-h-[28rem] w-full rounded-md object-contain"
          />
        ) : (
          <p className="text-sm text-muted-foreground">{context.message ?? 'No media preview is available.'}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/70 p-4 text-sm text-muted-foreground">
      {context.message ?? 'No retained content is available for this item.'}
    </div>
  );
}

function dialogCopy(action: ActionDialogState | null) {
  if (!action) return null;
  if (action.kind === 'report') {
    return action.status === 'resolved'
      ? { title: 'Resolve this report?', description: 'Confirm that the report was reviewed and actionable.', confirm: 'Resolve report' }
      : { title: 'Dismiss this report?', description: 'Close the report as not actionable.', confirm: 'Dismiss report' };
  }
  if (action.kind === 'review') {
    return action.action === 'approve'
      ? { title: 'Approve this content review?', description: 'Clear the automated flag or pending review.', confirm: 'Approve content' }
      : { title: 'Reject this content review?', description: 'Confirm the automated decision and block the reviewed item.', confirm: 'Reject content' };
  }
  if (action.kind === 'remove') {
    return { title: 'Remove the reported content?', description: 'This permanently removes the post, message, or photo and resolves the report.', confirm: 'Remove content' };
  }
  return {
    title: `Set account to ${accountStatusLabels[action.status]}?`,
    description: accountDescriptions[action.status],
    confirm: action.status === 'suspended' ? 'Suspend account' : `Set ${accountStatusLabels[action.status].toLowerCase()}`,
  };
}

export default function ModeratorReview() {
  const navigate = useNavigate();
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [source, setSource] = useState<ModerationQueueSource>('all');
  const [state, setState] = useState<ModerationQueueState>('open');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState({ limit: PAGE_SIZE, offset: 0, total: 0, hasMore: false });
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<{ kind: 'report' | 'review'; id: string } | null>(null);
  const [detail, setDetail] = useState<ModerationQueueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [latestReceipt, setLatestReceipt] = useState<(ModerationActionReceipt & { label: string }) | null>(null);

  const loadQueue = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial' && accessState !== 'ready') setAccessState('checking');
    if (mode === 'refresh') setRefreshing(true);
    try {
      const data = await getModerationQueue({ source, state, limit: PAGE_SIZE, offset });
      setItems(Array.isArray(data.items) ? data.items : []);
      setPage(data.page);
      setAccessState('ready');
    } catch (error) {
      if (isAccessDenied(error)) {
        setItems([]);
        setSelected(null);
        setDetail(null);
        setAccessState('denied');
      } else if (mode === 'initial') {
        setAccessState('error');
      } else {
        toast.error('Unable to refresh the moderation queue right now.');
      }
    } finally {
      setRefreshing(false);
    }
  }, [accessState, offset, source, state]);

  useEffect(() => {
    void loadQueue('initial');
  }, [offset, source, state]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadDetail = useCallback(async (selection: { kind: 'report' | 'review'; id: string }) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const data = await getModerationQueueItem(selection.kind, selection.id);
      setDetail(data);
    } catch (error) {
      if (isAccessDenied(error)) {
        setAccessState('denied');
        setDetail(null);
      } else {
        setDetailError('Unable to load this queue item right now.');
      }
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selected || accessState !== 'ready') {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setLatestReceipt(null);
    void loadDetail(selected);
  }, [accessState, loadDetail, selected]);

  const pageStart = page.total === 0 ? 0 : page.offset + 1;
  const pageEnd = Math.min(page.offset + items.length, page.total);
  const subject = useMemo(() => getDetailSubject(detail), [detail]);
  const copy = dialogCopy(actionDialog);

  const changeFilter = (next: ModerationQueueSource | ModerationQueueState, kind: 'source' | 'state') => {
    setOffset(0);
    setSelected(null);
    if (kind === 'source') setSource(next as ModerationQueueSource);
    else setState(next as ModerationQueueState);
  };

  const closeActionDialog = () => {
    if (pendingAction) return;
    setActionDialog(null);
    setNotes('');
    setValidationError(null);
  };

  const performAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!actionDialog || !detail || !selected || pendingAction) return;
    const noteRequired = actionDialog.kind !== 'report';
    if (noteRequired && !notes.trim()) {
      setValidationError('Add an audit note before confirming this action.');
      return;
    }

    setPendingAction(true);
    setValidationError(null);
    try {
      let receipt: ModerationActionReceipt;
      let label: string;
      if (actionDialog.kind === 'report' && detail.item.kind === 'report') {
        const result = await moderateReport(detail.item.report.id, {
          status: actionDialog.status,
          reasonCode: actionDialog.status === 'resolved' ? 'reviewed_valid_report' : 'not_actionable',
          notes,
        });
        receipt = result.moderationAction;
        label = actionDialog.status === 'resolved' ? 'Report resolved' : 'Report dismissed';
      } else if (actionDialog.kind === 'review' && detail.item.kind === 'review') {
        const result = await decideContentReview(detail.item.review.id, {
          action: actionDialog.action,
          reasonCode: actionDialog.action === 'approve' ? 'manual_review_approved' : 'manual_review_rejected',
          notes,
        });
        receipt = result.moderationAction;
        label = actionDialog.action === 'approve' ? 'Content approved' : 'Content rejected';
      } else if (actionDialog.kind === 'remove' && detail.item.kind === 'report') {
        const result = await removeReportedContent(detail.item.report.id, {
          reasonCode: 'reported_content_removed',
          notes,
        });
        receipt = result.moderationAction;
        label = 'Reported content removed';
      } else if (actionDialog.kind === 'account' && subject?.userId) {
        const result = await changeModeratedAccountStatus(subject.userId, {
          status: actionDialog.status,
          reasonCode: actionDialog.status === 'suspended'
            ? 'abuse_confirmed'
            : actionDialog.status === 'under_review'
              ? 'needs_manual_review'
              : 'review_cleared',
          notes,
          ...(subject.reportId ? { reportId: subject.reportId } : {}),
        });
        receipt = result.moderationAction;
        label = `Account set to ${accountStatusLabels[actionDialog.status].toLowerCase()}`;
      } else {
        throw new Error('The selected action is unavailable.');
      }

      setLatestReceipt({ ...receipt, label });
      toast.success(`${label}.`);
      setActionDialog(null);
      setNotes('');
      await loadQueue('refresh');
      if (state === 'open' && actionDialog.kind !== 'account') {
        setSelected(null);
        setDetail(null);
      } else {
        await loadDetail(selected);
      }
    } catch {
      setValidationError('The moderation action could not be completed. Nothing was confirmed.');
    } finally {
      setPendingAction(false);
    }
  };

  if (accessState === 'checking') {
    return <div className="min-h-screen bg-background p-8 text-sm text-muted-foreground">Checking moderator access...</div>;
  }

  if (accessState === 'denied') {
    return (
      <div className="min-h-screen bg-background px-4 py-16 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <h1 className="mt-4 text-2xl">Moderator access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">This interface is available only to active Cruush moderators.</p>
        <Button className="mt-6" variant="outline" onClick={() => navigate('/map')}>Return to map</Button>
      </div>
    );
  }

  if (accessState === 'error') {
    return (
      <div className="min-h-screen bg-background px-4 py-16 text-center">
        <h1 className="text-2xl">Moderation queue unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">The queue could not be loaded safely.</p>
        <Button className="mt-6" onClick={() => void loadQueue('initial')}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Return to settings" onClick={() => navigate('/settings')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl">Moderation dashboard</h1>
              <p className="text-xs text-muted-foreground">Reports and automated review candidates</p>
            </div>
          </div>
          <Button variant="outline" disabled={refreshing} onClick={() => void loadQueue('refresh')}>
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(25rem,1fr)]">
        <section aria-labelledby="queue-heading" className="min-w-0">
          <div className="space-y-4 border-b border-border pb-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="queue-heading" className="text-lg">Unified queue</h2>
                <p className="text-sm text-muted-foreground">{pageStart}-{pageEnd} of {page.total}</p>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="outline" aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="outline" aria-label="Next page" disabled={!page.hasMore} onClick={() => setOffset(offset + PAGE_SIZE)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select aria-label="Queue source" value={source} onChange={(event) => changeFilter(event.target.value as ModerationQueueSource, 'source')} className="h-9 rounded-md border border-border bg-input-background px-3 text-sm">
                <option value="all">Reports and automod</option>
                <option value="reports">User reports</option>
                <option value="automod">Automod reviews</option>
              </select>
              <select aria-label="Queue state" value={state} onChange={(event) => changeFilter(event.target.value as ModerationQueueState, 'state')} className="h-9 rounded-md border border-border bg-input-background px-3 text-sm">
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="all">All states</option>
              </select>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">No moderation items match these filters.</div>
          ) : (
            <div className="divide-y divide-border">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-label={`Open ${sourceLabel(item)} ${item.id}`}
                  aria-pressed={selected?.kind === item.kind && selected.id === item.id}
                  className={`flex w-full items-center gap-4 px-2 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.kind === item.kind && selected.id === item.id ? 'bg-accent/60' : ''}`}
                  onClick={() => setSelected({ kind: item.kind, id: item.id })}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={item.kind === 'report' ? 'default' : 'outline'}>{sourceLabel(item)}</Badge>
                      <Badge variant={statusVariant(item.status)}>{formatCode(item.status)}</Badge>
                      <span className="text-xs capitalize text-muted-foreground">{targetLabel(item)}</span>
                    </div>
                    <p className="mt-2 truncate font-medium">{formatCode(item.reason)}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{item.subject.displayName ?? item.summary ?? 'Target unavailable'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="detail-heading" className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 id="detail-heading" className="text-lg">Review detail</h2>
          {!selected ? <p className="mt-4 text-sm text-muted-foreground">Select a queue item to inspect its evidence and content context.</p> : null}
          {detailLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading moderation context...</p> : null}
          {detailError ? <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{detailError}</div> : null}

          {!detailLoading && detail ? (
            <div className="mt-4 space-y-6">
              <div className="space-y-3 border-b border-border pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{detail.item.kind === 'report' ? 'User report' : 'Automod review'}</Badge>
                  <Badge variant="outline">
                    {formatCode(detail.item.kind === 'report' ? detail.item.report.status : detail.item.review.moderationStatus)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reason</p>
                  <p className="font-medium">{formatCode(detail.item.kind === 'report' ? detail.item.report.reason : detail.item.review.reason)}</p>
                </div>
                {detail.item.kind === 'report' ? (
                  <div>
                    <p className="text-sm text-muted-foreground">Reporter details</p>
                    <p className="whitespace-pre-wrap text-sm">{detail.item.report.details.trim() || 'No additional details provided.'}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Reported by {detail.item.report.reporter.displayName}</p>
                  </div>
                ) : (
                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted-foreground">Surface</dt><dd>{formatCode(detail.item.review.surface)}</dd></div>
                    <div><dt className="text-muted-foreground">Provider</dt><dd>{detail.item.review.provider ?? 'Unknown'}</dd></div>
                    <div><dt className="text-muted-foreground">Storage state</dt><dd>{formatCode(detail.item.review.storageStatus)}</dd></div>
                    <div><dt className="text-muted-foreground">Content type</dt><dd>{detail.item.review.contentType}</dd></div>
                  </dl>
                )}
              </div>

              <div className="space-y-3 border-b border-border pb-5">
                <h3 className="font-medium">Content context</h3>
                <ContextView context={detail.context} />
              </div>

              {detail.item.kind === 'review' ? (
                <div className="space-y-3 border-b border-border pb-5">
                  <h3 className="font-medium">Automated evidence</h3>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-xs">{JSON.stringify({
                    labels: detail.item.review.normalizedLabels,
                    policyDecision: detail.item.review.policyDecision,
                    contentRef: detail.item.review.contentRef,
                  }, null, 2)}</pre>
                  {detail.availableActions.canDecideReview ? (
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => setActionDialog({ kind: 'review', action: 'approve' })}><CheckCircle2 />Approve</Button>
                      <Button variant="destructive" onClick={() => setActionDialog({ kind: 'review', action: 'reject' })}><XCircle />Reject</Button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3 border-b border-border pb-5">
                  <h3 className="font-medium">Report resolution</h3>
                  <div className="flex flex-wrap gap-2">
                    {detail.availableActions.canResolve ? (
                      <>
                        <Button onClick={() => setActionDialog({ kind: 'report', status: 'resolved' })}>Resolve report</Button>
                        <Button variant="outline" onClick={() => setActionDialog({ kind: 'report', status: 'dismissed' })}>Dismiss report</Button>
                      </>
                    ) : <p className="text-sm text-muted-foreground">This report is closed.</p>}
                    {detail.availableActions.canRemoveContent ? (
                      <Button variant="destructive" onClick={() => setActionDialog({ kind: 'remove' })}><Trash2 />Remove content</Button>
                    ) : null}
                  </div>
                </div>
              )}

              {detail.availableActions.canModerateAccount && subject?.userId ? (
                <div className="space-y-3 border-b border-border pb-5">
                  <div>
                    <h3 className="font-medium">Account enforcement</h3>
                    <p className="text-sm text-muted-foreground">Current status: {subject.accountStatus ? accountStatusLabels[subject.accountStatus] : 'Unknown'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(accountStatusLabels) as ModeratedAccountStatus[]).map((accountStatus) => (
                      <Button
                        key={accountStatus}
                        size="sm"
                        variant={accountStatus === 'suspended' ? 'destructive' : 'outline'}
                        disabled={subject.accountStatus === accountStatus}
                        onClick={() => setActionDialog({ kind: 'account', status: accountStatus })}
                      >
                        {accountStatus === 'suspended' ? 'Suspend' : `Set ${accountStatusLabels[accountStatus].toLowerCase()}`}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-3">
                <h3 className="font-medium">Audit history</h3>
                {latestReceipt ? (
                  <div className="rounded-md border border-primary/25 bg-primary/10 p-3 text-sm">
                    <p>{latestReceipt.label}</p>
                    <p className="text-xs text-muted-foreground">Recorded {formatDateTime(latestReceipt.createdAt)}</p>
                  </div>
                ) : null}
                {detail.history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No moderator actions have been recorded.</p>
                ) : (
                  <div className="space-y-3">
                    {detail.history.map((history) => (
                      <div key={history.id} className="border-l-2 border-border pl-3 text-sm">
                        <p className="font-medium">{formatCode(history.action)}</p>
                        <p className="text-xs text-muted-foreground">{history.actorDisplayName} · {formatDateTime(history.createdAt)}</p>
                        {history.notes ? <p className="mt-1 whitespace-pre-wrap">{history.notes}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </main>

      <Dialog open={Boolean(actionDialog)} onOpenChange={(open) => { if (!open) closeActionDialog(); }}>
        <DialogContent>
          <form onSubmit={(event) => void performAction(event)}>
            <DialogHeader>
              <DialogTitle>{copy?.title}</DialogTitle>
              <DialogDescription>{copy?.description}</DialogDescription>
            </DialogHeader>
            <div className="mt-5 space-y-2">
              <Label htmlFor="moderation-action-notes">Audit note{actionDialog?.kind === 'report' ? ' (optional)' : ''}</Label>
              <Textarea
                id="moderation-action-notes"
                value={notes}
                maxLength={2000}
                disabled={pendingAction}
                onChange={(event) => { setNotes(event.target.value); setValidationError(null); }}
                placeholder="Document the evidence and decision."
                className="min-h-28"
              />
              {validationError ? <p className="text-sm text-destructive">{validationError}</p> : null}
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" disabled={pendingAction} onClick={closeActionDialog}>Cancel</Button>
              <Button type="submit" variant={actionDialog?.kind === 'remove' || (actionDialog?.kind === 'review' && actionDialog.action === 'reject') || (actionDialog?.kind === 'account' && actionDialog.status === 'suspended') ? 'destructive' : 'default'} disabled={pendingAction}>
                {pendingAction ? 'Saving...' : copy?.confirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
