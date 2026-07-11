import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronRight, RefreshCw, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ApiClientError } from '../lib/apiClient';
import {
  changeModeratedAccountStatus,
  getModerationReport,
  getModerationReports,
  moderateReport,
  type ChangeAccountStatusResult,
  type ModeratedAccountStatus,
  type ModerationActionReceipt,
  type ModerationReport,
  type ModerationReportStatus,
  type ModerationTargetType,
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

type QueueStatusFilter = 'open' | 'closed' | 'all';
type AccessState = 'checking' | 'ready' | 'denied' | 'error';
type ActionDialogState =
  | { kind: 'report'; status: 'resolved' | 'dismissed' }
  | { kind: 'account'; status: ModeratedAccountStatus };

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

const targetTypeLabels: Record<ModerationTargetType, string> = {
  user: 'User',
  profile: 'Profile',
  conversation: 'Conversation',
  message: 'Message',
  post: 'Post',
  profile_photo: 'Profile photo',
};

const reportStatusLabels: Record<ModerationReportStatus, string> = {
  open: 'Open',
  automod_processing: 'Automod processing',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const accountStatusLabels: Record<ModeratedAccountStatus, string> = {
  active: 'Active',
  under_review: 'Under review',
  suspended: 'Suspended',
};

const accountActionDescriptions: Record<ModeratedAccountStatus, string> = {
  under_review: 'Keeps safe account, support, and reporting access while blocking unsafe writes.',
  suspended: 'Invalidates sessions and blocks sign-in and app access.',
  active: 'Restores normal account access and unsafe write actions.',
};

const accountReasonCodes: Record<ModeratedAccountStatus, string> = {
  under_review: 'needs_manual_review',
  suspended: 'abuse_confirmed',
  active: 'review_cleared',
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatReason(reason: string) {
  return reasonLabels[reason] ?? reason.replaceAll('_', ' ');
}

function shortenIdentifier(value: string | null) {
  if (!value) {
    return null;
  }

  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

function getTargetIdentifier(report: ModerationReport) {
  const target = report.target;
  return target.postId
    ?? target.messageId
    ?? target.conversationId
    ?? target.mediaObjectId
    ?? target.userId;
}

function getTargetSummary(report: ModerationReport) {
  const displayName = report.target.displayName?.trim();
  const identifier = shortenIdentifier(getTargetIdentifier(report));

  if (displayName && identifier) {
    return `${displayName} · ${identifier}`;
  }

  return displayName || identifier || 'Target unavailable';
}

function statusBadgeVariant(status: ModerationReportStatus) {
  if (status === 'resolved') {
    return 'default' as const;
  }

  if (status === 'dismissed') {
    return 'secondary' as const;
  }

  return 'outline' as const;
}

function isAccessDenied(error: unknown) {
  return error instanceof ApiClientError && (error.status === 401 || error.status === 403);
}

function getDialogCopy(action: ActionDialogState) {
  if (action.kind === 'report') {
    return action.status === 'resolved'
      ? {
          title: 'Resolve this report?',
          description: 'This marks the report as reviewed and resolved. The backend will record the action.',
          confirmLabel: 'Resolve report',
        }
      : {
          title: 'Dismiss this report?',
          description: 'This closes the report as not actionable. The backend will record the action.',
          confirmLabel: 'Dismiss report',
        };
  }

  return {
    title: `Set account to ${accountStatusLabels[action.status]}?`,
    description: accountActionDescriptions[action.status],
    confirmLabel: action.status === 'suspended' ? 'Suspend account' : `Set ${accountStatusLabels[action.status].toLowerCase()}`,
  };
}

export default function ModeratorReview() {
  const navigate = useNavigate();
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>('open');
  const [targetTypeFilter, setTargetTypeFilter] = useState<ModerationTargetType | 'all'>('all');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<ModerationReport | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionDialog, setActionDialog] = useState<ActionDialogState | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionValidationError, setActionValidationError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [confirmedAccount, setConfirmedAccount] = useState<ChangeAccountStatusResult['user'] | null>(null);
  const [latestReceipt, setLatestReceipt] = useState<(ModerationActionReceipt & { label: string }) | null>(null);

  const loadReports = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') {
      setAccessState('checking');
    } else {
      setRefreshing(true);
    }

    try {
      const data = await getModerationReports({ limit: 100, offset: 0 });
      setReports(Array.isArray(data.reports) ? data.reports : []);
      setAccessState('ready');
    } catch (error) {
      if (isAccessDenied(error)) {
        setReports([]);
        setSelectedReportId(null);
        setSelectedReport(null);
        setAccessState('denied');
      } else if (mode === 'initial') {
        setAccessState('error');
      } else {
        toast.error('Unable to refresh the moderation queue right now.');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  useEffect(() => {
    if (!selectedReportId || accessState !== 'ready') {
      setSelectedReport(null);
      setDetailError(null);
      return undefined;
    }

    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    setConfirmedAccount(null);
    setLatestReceipt(null);

    getModerationReport(selectedReportId)
      .then((data) => {
        if (active) {
          setSelectedReport(data.report);
        }
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        if (isAccessDenied(error)) {
          setAccessState('denied');
          setSelectedReport(null);
          return;
        }

        setDetailError('Unable to load this report right now.');
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [accessState, selectedReportId]);

  const filteredReports = useMemo(() => reports.filter((report) => {
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'open' && (report.status === 'open' || report.status === 'automod_processing'))
      || (statusFilter === 'closed' && (report.status === 'resolved' || report.status === 'dismissed'));
    const matchesTarget = targetTypeFilter === 'all' || report.target.type === targetTypeFilter;
    return matchesStatus && matchesTarget;
  }), [reports, statusFilter, targetTypeFilter]);

  const closeActionDialog = () => {
    if (pendingAction) {
      return;
    }

    setActionDialog(null);
    setActionNotes('');
    setActionValidationError(null);
  };

  const resetActionDialog = () => {
    setActionDialog(null);
    setActionNotes('');
    setActionValidationError(null);
  };

  const handleActionSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!actionDialog || !selectedReport || pendingAction) {
      return;
    }

    const notes = actionNotes.trim();
    if (actionDialog.kind === 'account' && !notes) {
      setActionValidationError('Add a moderation note before changing account status.');
      return;
    }

    setPendingAction(true);
    setActionValidationError(null);

    try {
      if (actionDialog.kind === 'report') {
        const result = await moderateReport(selectedReport.id, {
          status: actionDialog.status,
          reasonCode: actionDialog.status === 'resolved' ? 'reviewed_valid_report' : 'not_actionable',
          notes,
        });
        const nextReport = {
          ...selectedReport,
          status: result.report.status,
          updatedAt: result.report.updatedAt,
        };
        setSelectedReport(nextReport);
        setReports((current) => current.map((report) => report.id === nextReport.id ? nextReport : report));
        setLatestReceipt({
          ...result.moderationAction,
          label: actionDialog.status === 'resolved' ? 'Report resolved' : 'Report dismissed',
        });
        toast.success(actionDialog.status === 'resolved' ? 'Report resolved.' : 'Report dismissed.');
        resetActionDialog();
        void loadReports('refresh');
      } else if (selectedReport.target.userId) {
        const result = await changeModeratedAccountStatus(selectedReport.target.userId, {
          status: actionDialog.status,
          reasonCode: accountReasonCodes[actionDialog.status],
          notes,
          reportId: selectedReport.id,
        });
        setConfirmedAccount(result.user);
        setLatestReceipt({
          ...result.moderationAction,
          label: `Account set to ${accountStatusLabels[result.user.accountStatus]}`,
        });
        toast.success(`Account status set to ${accountStatusLabels[result.user.accountStatus].toLowerCase()}.`);
        resetActionDialog();
      }
    } catch {
      toast.error('Unable to complete this moderation action right now.');
    } finally {
      setPendingAction(false);
    }
  };

  if (accessState === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        Checking moderator access...
      </div>
    );
  }

  if (accessState === 'denied') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl">Moderator access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">This internal review interface is available only to active Cruush moderators.</p>
          <Button className="mt-6" variant="outline" onClick={() => navigate('/map')}>Return to map</Button>
        </div>
      </div>
    );
  }

  if (accessState === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl">Moderation queue unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">The queue could not be loaded. No moderation actions are available.</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => navigate('/map')}>Return to map</Button>
            <Button onClick={() => void loadReports()}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  const dialogCopy = actionDialog ? getDialogCopy(actionDialog) : null;

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" aria-label="Return to map" onClick={() => navigate('/map')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-xl">Moderation review</h1>
              <p className="text-xs text-muted-foreground">Internal beta safety queue</p>
            </div>
          </div>
          <Button variant="outline" disabled={refreshing} onClick={() => void loadReports('refresh')}>
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
        <section aria-labelledby="report-queue-heading" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
            <div>
              <h2 id="report-queue-heading" className="text-lg">Report queue</h2>
              <p className="text-sm text-muted-foreground">{filteredReports.length} shown from the latest {reports.length}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border border-border p-1" aria-label="Report status filter">
                {(['open', 'closed', 'all'] as const).map((filter) => (
                  <Button
                    key={filter}
                    type="button"
                    size="sm"
                    variant={statusFilter === filter ? 'secondary' : 'ghost'}
                    aria-pressed={statusFilter === filter}
                    onClick={() => setStatusFilter(filter)}
                  >
                    {filter[0].toUpperCase() + filter.slice(1)}
                  </Button>
                ))}
              </div>
              <select
                aria-label="Target type"
                value={targetTypeFilter}
                onChange={(event) => setTargetTypeFilter(event.target.value as ModerationTargetType | 'all')}
                className="h-9 rounded-md border border-border bg-input-background px-3 text-sm"
              >
                <option value="all">All target types</option>
                {(Object.keys(targetTypeLabels) as ModerationTargetType[]).map((targetType) => (
                  <option key={targetType} value={targetType}>{targetTypeLabels[targetType]}</option>
                ))}
              </select>
            </div>
          </div>

          {filteredReports.length === 0 ? (
            <div className="py-14 text-center text-sm text-muted-foreground">No reports match these filters.</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredReports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  aria-label={`Open report ${report.id}`}
                  aria-pressed={selectedReportId === report.id}
                  className={`flex w-full items-center gap-4 px-2 py-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selectedReportId === report.id ? 'bg-accent/60' : ''
                  }`}
                  onClick={() => setSelectedReportId(report.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusBadgeVariant(report.status)}>{reportStatusLabels[report.status]}</Badge>
                      <span className="text-xs text-muted-foreground">{targetTypeLabels[report.target.type]}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(report.createdAt)}</span>
                    </div>
                    <p className="mt-2 truncate font-medium">{formatReason(report.reason)}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{getTargetSummary(report)}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="report-detail-heading" className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
          <h2 id="report-detail-heading" className="text-lg">Report detail</h2>

          {!selectedReportId ? (
            <p className="mt-4 text-sm text-muted-foreground">Select a report to inspect its moderation context.</p>
          ) : null}

          {detailLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading report detail...</p> : null}

          {!detailLoading && detailError ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{detailError}</div>
          ) : null}

          {!detailLoading && selectedReport ? (
            <div className="mt-4 space-y-6">
              <div className="space-y-3 border-b border-border pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusBadgeVariant(selectedReport.status)}>{reportStatusLabels[selectedReport.status]}</Badge>
                  <span className="text-sm text-muted-foreground">{targetTypeLabels[selectedReport.target.type]}</span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reason</p>
                  <p className="font-medium">{formatReason(selectedReport.reason)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reporter details</p>
                  <p className="whitespace-pre-wrap text-sm">{selectedReport.details.trim() || 'No additional details provided.'}</p>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Reporter</dt>
                    <dd>{selectedReport.reporter.displayName}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Target</dt>
                    <dd>{getTargetSummary(selectedReport)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Report ID</dt>
                    <dd className="break-all font-mono text-xs">{selectedReport.id}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Target ID</dt>
                    <dd className="break-all font-mono text-xs">{getTargetIdentifier(selectedReport) ?? 'Unavailable'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatDateTime(selectedReport.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd>{formatDateTime(selectedReport.updatedAt)}</dd>
                  </div>
                </dl>
              </div>

              <div className="space-y-3 border-b border-border pb-5">
                <h3 className="font-medium">Report resolution</h3>
                {selectedReport.status === 'open' || selectedReport.status === 'automod_processing' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={() => setActionDialog({ kind: 'report', status: 'resolved' })}>Resolve report</Button>
                    <Button type="button" variant="outline" onClick={() => setActionDialog({ kind: 'report', status: 'dismissed' })}>Dismiss report</Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">This report is already closed.</p>
                )}
              </div>

              {selectedReport.target.userId ? (
                <div className="space-y-3 border-b border-border pb-5">
                  <div>
                    <h3 className="font-medium">Account enforcement</h3>
                    {confirmedAccount ? (
                      <p className="mt-1 text-sm" role="status" aria-live="polite">
                        Confirmed status: <strong>{accountStatusLabels[confirmedAccount.accountStatus]}</strong>
                        {' · '}{formatDateTime(confirmedAccount.accountStatusUpdatedAt)}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">Current account status is not included in the report API.</p>
                    )}
                  </div>
                  {(Object.keys(accountStatusLabels) as ModeratedAccountStatus[]).map((status) => (
                    <div key={status} className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{accountStatusLabels[status]}</p>
                        <p className="text-xs text-muted-foreground">{accountActionDescriptions[status]}</p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={status === 'suspended' ? 'destructive' : 'outline'}
                        onClick={() => setActionDialog({ kind: 'account', status })}
                      >
                        {status === 'suspended' ? 'Suspend' : `Set ${accountStatusLabels[status].toLowerCase()}`}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div>
                <h3 className="font-medium">Audit record</h3>
                {latestReceipt ? (
                  <div className="mt-2 text-sm">
                    <p>{latestReceipt.label}</p>
                    <p className="text-muted-foreground">Recorded {formatDateTime(latestReceipt.createdAt)}</p>
                    <p className="break-all font-mono text-xs text-muted-foreground">{latestReceipt.id}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No action has been recorded in this review session.</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">Full moderation history is not exposed by the current backend.</p>
              </div>
            </div>
          ) : null}
        </section>
      </main>

      <Dialog
        open={Boolean(actionDialog)}
        onOpenChange={(open) => {
          if (!open) {
            closeActionDialog();
          }
        }}
      >
        <DialogContent>
          {actionDialog && dialogCopy ? (
            <form className="space-y-5" onSubmit={(event) => void handleActionSubmit(event)}>
              <DialogHeader>
                <DialogTitle>{dialogCopy.title}</DialogTitle>
                <DialogDescription>{dialogCopy.description}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="moderation-action-notes">
                  Moderation note{actionDialog.kind === 'report' ? ' (optional)' : ''}
                </Label>
                <Textarea
                  id="moderation-action-notes"
                  value={actionNotes}
                  maxLength={2000}
                  disabled={pendingAction}
                  aria-required={actionDialog.kind === 'account'}
                  onChange={(event) => {
                    setActionNotes(event.target.value);
                    setActionValidationError(null);
                  }}
                  placeholder="Add concise context for the audit record."
                  className="min-h-28"
                />
                {actionValidationError ? <p className="text-sm text-destructive">{actionValidationError}</p> : null}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" disabled={pendingAction} onClick={closeActionDialog}>Cancel</Button>
                <Button
                  type="submit"
                  variant={actionDialog.kind === 'account' && actionDialog.status === 'suspended' ? 'destructive' : 'default'}
                  disabled={pendingAction}
                >
                  {pendingAction ? 'Submitting...' : dialogCopy.confirmLabel}
                </Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
