import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock3, Mail, RefreshCw, Search, Send } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from '../lib/toast';
import { ApiClientError, resolveMediaUrl } from '../lib/apiClient';
import {
  getSupportRequests,
  replyToSupportRequest,
  type SupportRequestAdminRecord,
  type SupportRequestSource,
} from '../lib/supportApi';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Textarea } from './ui/textarea';
import LoadingCardSkeletons from './LoadingCardSkeletons';

type RequestStatusFilter = 'open' | 'in_progress' | 'closed' | 'dismissed' | 'all';
type RequestCategoryFilter = 'all' | 'suspension_appeal';

const PAGE_SIZE = 25;

const statusTabs: Array<{ value: RequestStatusFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];

const categoryLabels: Record<SupportRequestAdminRecord['category'], string> = {
  bug: 'Bug',
  comment: 'Comment',
  question: 'Question',
  policy: 'Policy',
  suspension_appeal: 'Suspension appeal',
};

const sourceLabels: Record<SupportRequestSource, string> = {
  auth: 'Auth',
  settings: 'Settings',
  policy: 'Policy',
  unknown: 'Unknown',
  survey: 'Survey',
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isAccessDenied(error: unknown) {
  return error instanceof ApiClientError && (error.status === 401 || error.status === 403);
}

export default function RequestsDashboard() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<RequestStatusFilter>('open');
  const [categoryFilter, setCategoryFilter] = useState<RequestCategoryFilter>('all');
  const [offset, setOffset] = useState(0);
  const [requests, setRequests] = useState<SupportRequestAdminRecord[]>([]);
  const [page, setPage] = useState({ limit: PAGE_SIZE, offset: 0, total: 0, hasMore: false });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [submittingRequestId, setSubmittingRequestId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    setIsLoading(true);
    setError(null);

    getSupportRequests({ status: filter, category: categoryFilter, limit: PAGE_SIZE, offset })
      .then((response) => {
        if (!active) {
          return;
        }

        setRequests(response.requests);
        setPage(response.page);
      })
      .catch((fetchError) => {
        if (!active) {
          return;
        }

        if (isAccessDenied(fetchError)) {
          setError('Moderator access is required to read bug reports.');
        } else {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load bug reports.');
        }
        setRequests([]);
        setPage({ limit: PAGE_SIZE, offset, total: 0, hasMore: false });
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [categoryFilter, filter, offset]);

  const handleReply = async (event: FormEvent<HTMLFormElement>, request: SupportRequestAdminRecord) => {
    event.preventDefault();

    const draft = replyDrafts[request.id]?.trim() ?? '';
    if (!draft) {
      toast.error('Write a reply before sending it.');
      return;
    }

    if (!request.recipientEmail) {
      toast.error('This report has no reply address on file.');
      return;
    }

    setSubmittingRequestId(request.id);

    try {
      const response = await replyToSupportRequest(request.id, { message: draft });
      setReplyDrafts((current) => ({ ...current, [request.id]: '' }));
      setRequests((current) => current.map((item) => (
        item.id === request.id
          ? {
              ...item,
              status: item.status === 'open' ? 'in_progress' : item.status,
              replyCount: item.replyCount + 1,
              lastReplyAt: response.reply.createdAt,
            }
          : item
      )));

      if (response.reply.deliveryStatus === 'failed') {
        toast.error('Reply saved, but the email delivery failed.');
      } else {
        toast.success('Reply sent.');
      }
    } catch (replyError) {
      toast.error(replyError instanceof Error ? replyError.message : 'Failed to send reply.');
    } finally {
      setSubmittingRequestId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="cruush-requests-header sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-card/80 p-4 backdrop-blur-sm">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="cruush-requests-title min-w-0">
          <h2 className="text-xl">Bug reports</h2>
          <p className="text-sm text-muted-foreground">
            {page.total} {categoryFilter === 'suspension_appeal' ? 'age suspension appeal' : 'request'}{page.total === 1 ? '' : 's'}
          </p>
        </div>
        <Button
          className="cruush-requests-refresh ml-auto"
          variant="outline"
          onClick={() => {
            setIsLoading(true);
            getSupportRequests({ status: filter, category: categoryFilter, limit: PAGE_SIZE, offset })
              .then((response) => {
                setRequests(response.requests);
                setPage(response.page);
                setError(null);
              })
              .catch((fetchError) => {
                setError(fetchError instanceof Error ? fetchError.message : 'Failed to load bug reports.');
              })
              .finally(() => setIsLoading(false));
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </header>

      <div className="mx-auto max-w-5xl p-4">
        <Tabs value={filter} onValueChange={(value) => { setOffset(0); setFilter(value as RequestStatusFilter); }} className="w-full">
          <TabsList className="cruush-requests-tabs grid w-full grid-cols-5">
            {statusTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={filter} className="mt-0">
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <select
                  aria-label="Request type filter"
                  className="h-10 min-w-0 flex-1 rounded-md border border-border bg-input-background px-3 text-sm sm:max-w-xs"
                  onChange={(event) => {
                    setOffset(0);
                    setCategoryFilter(event.target.value as RequestCategoryFilter);
                  }}
                  value={categoryFilter}
                >
                  <option value="all">All requests</option>
                  <option value="suspension_appeal">Age suspension appeals</option>
                </select>
                <div className="flex shrink-0 gap-1">
                  <Button
                    aria-label="Previous request page"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    aria-label="Next request page"
                    disabled={!page.hasMore}
                    onClick={() => setOffset(offset + PAGE_SIZE)}
                    size="icon"
                    variant="outline"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Search className="h-4 w-4" />
                <span>Replies send from the support inbox and store the reply in the request history.</span>
              </div>

              {error ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                  {error}
                </div>
              ) : isLoading ? (
                <LoadingCardSkeletons label="Loading bug reports" />
              ) : requests.length === 0 ? (
                <div className="rounded-lg border border-border bg-card/60 p-8 text-center text-muted-foreground">
                  {categoryFilter === 'suspension_appeal' ? 'No age suspension appeals match this filter.' : 'No requests match this filter.'}
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map((request) => (
                    <article key={request.id} className="rounded-2xl border border-border bg-card/80 p-4 shadow-sm">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{categoryLabels[request.category]}</Badge>
                            <Badge variant="secondary">{sourceLabels[request.source]}</Badge>
                            <Badge variant={request.status === 'closed' || request.status === 'dismissed' ? 'secondary' : 'default'}>
                              {request.status.replaceAll('_', ' ')}
                            </Badge>
                          </div>

                          <div>
                            <h3 className="text-lg leading-tight">{request.subject}</h3>
                            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{request.message}</p>
                          </div>

                          {request.appealEvidence?.length ? (
                            <div className="space-y-2">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Private appeal evidence</p>
                              <div className="flex flex-wrap gap-3">
                                {request.appealEvidence.map((evidence) => (
                                  <a
                                    className="block overflow-hidden rounded-md border border-border bg-muted/30"
                                    href={resolveMediaUrl(evidence.previewUrl)}
                                    key={evidence.type}
                                    rel="noreferrer"
                                    target="_blank"
                                  >
                                    <img
                                      alt={evidence.type === 'id' ? 'Redacted ID showing date of birth and photo' : 'Appeal selfie'}
                                      className="h-32 w-24 object-cover"
                                      loading="lazy"
                                      src={resolveMediaUrl(evidence.previewUrl)}
                                    />
                                    <span className="block px-2 py-1 text-center text-xs capitalize">{evidence.type}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4" />
                              <span>{request.recipientEmail ?? request.contactEmail ?? 'No reply address'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock3 className="h-4 w-4" />
                              <span>{formatDateTime(request.createdAt)}</span>
                            </div>
                            <div className="sm:col-span-2">
                              <span className="text-xs uppercase tracking-wide text-muted-foreground">Page</span>
                              <p className="break-all text-xs">{request.pageUrl || 'unknown'}</p>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Replies: {request.replyCount}
                            {request.lastReplyAt ? ` · last reply ${formatDateTime(request.lastReplyAt)}` : ''}
                          </p>
                        </div>
                      </div>

                      <form className="mt-4 space-y-3" onSubmit={(event) => handleReply(event, request)}>
                        <Textarea
                          className="min-h-[120px] bg-input-background"
                          disabled={submittingRequestId === request.id || !request.recipientEmail}
                          placeholder={
                            request.recipientEmail
                              ? 'Write the reply that should go to the reporter...'
                              : 'No reply address is available for this request.'
                          }
                          onChange={(event) => setReplyDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                          value={replyDrafts[request.id] ?? ''}
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            {request.recipientEmail
                              ? `Will email ${request.recipientEmail}.`
                              : 'This request cannot be replied to until a reply address exists.'}
                          </p>
                          <Button
                            className="min-w-40"
                            disabled={submittingRequestId === request.id || !request.recipientEmail}
                            type="submit"
                            style={{ background: 'var(--cruush-gradient)' }}
                          >
                            {submittingRequestId === request.id ? (
                              'Sending...'
                            ) : (
                              <>
                                <Send className="mr-2 h-4 w-4" />
                                Send reply
                              </>
                            )}
                          </Button>
                        </div>
                      </form>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
