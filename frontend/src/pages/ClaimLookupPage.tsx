import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardHeading,
} from '../components/ui/Card'
import { StatePanel } from '../components/ui/StatePanel'
import { Callout } from '../components/ui/Callout'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FormField } from '../components/ui/FormField'
import { Input } from '../components/ui/Input'
import { FileSearchIcon, LookupIcon } from '../components/icons'
import { formatCurrency, formatDate } from '../features/claimAnalysis/formatters'
import { getClaimById, type ClaimDetails } from '../api/retrieval'
import { describeApiError, isApiError } from '../api/errors'

/** The four failure flavours the page renders differently. */
type LookupErrorKind = 'not-found' | 'network' | 'server' | 'unexpected'

interface LookupError {
  kind: LookupErrorKind
  /** Safe, user-facing detail. Never a stack trace or raw body. */
  message: string
}

type LookupState =
  | { status: 'idle' }
  | { status: 'loading'; claimId: string }
  | { status: 'found'; claimId: string; claim: ClaimDetails }
  | { status: 'error'; claimId: string; error: LookupError }

/** Shown wherever a persisted value is absent, so nothing is fabricated. */
const MISSING = 'Not available'

/**
 * Map any lookup failure onto a small set of UI states. A 404 is a distinct
 * "not found" outcome, not an empty success; a network failure is distinct from
 * a server error. Raw error bodies are never surfaced.
 */
function toLookupError(error: unknown): LookupError {
  if (isApiError(error)) {
    if (error.kind === 'http' && error.status === 404) {
      return { kind: 'not-found', message: 'No stored claim matches that ID.' }
    }
    if (error.kind === 'network' || error.kind === 'timeout') {
      return {
        kind: 'network',
        message:
          'The service did not respond. Check the connection and try again.',
      }
    }
    if (error.kind === 'http') {
      return { kind: 'server', message: describeApiError(error) }
    }
    return { kind: 'unexpected', message: describeApiError(error) }
  }
  return {
    kind: 'unexpected',
    message: 'An unexpected error occurred while looking up the claim.',
  }
}

function errorCopy(error: LookupError): { title: string; description: string } {
  switch (error.kind) {
    case 'not-found':
      return {
        title: 'No saved claim found',
        description:
          'No stored claim matches that ID. Check the ID and try again.',
      }
    case 'network':
      return {
        title: 'The backend could not be reached',
        description:
          'The service may be offline. Check the connection and try again.',
      }
    case 'server':
      return {
        title: 'The claim could not be retrieved',
        description: error.message,
      }
    case 'unexpected':
      return { title: 'Unexpected response', description: error.message }
  }
}

function textOrMissing(value: string | null): string {
  if (value === null) return MISSING
  const trimmed = value.trim()
  return trimmed === '' ? MISSING : trimmed
}

function DetailItem({ term, value }: { term: string; value: string }) {
  const missing = value === MISSING
  return (
    <div className="min-w-0">
      <dt className="text-xs text-ink-500">{term}</dt>
      <dd
        className={
          missing
            ? 'text-sm font-medium text-ink-400'
            : 'break-words text-sm font-medium text-navy-900'
        }
      >
        {value}
      </dd>
    </div>
  )
}

/**
 * Stored claim details. Renders only fields present in the `ClaimDetails`
 * contract; missing values are labelled honestly. A retrieved claim is not
 * labelled fraudulent or safe — existence is not a judgement.
 */
function ClaimDetailsPanel({
  claim,
  claimId,
  onSearchAnother,
}: {
  claim: ClaimDetails
  claimId: string
  onSearchAnother: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardHeading
          title="Claim details"
          description={`Stored record for “${claimId}”.`}
          icon={<FileSearchIcon width={16} height={16} />}
        />
        {claim.claim_id ? (
          <Badge tone="info">Claim ID: {claim.claim_id}</Badge>
        ) : (
          <Badge tone="neutral">Claim ID not available</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          <DetailItem term="Claim ID" value={textOrMissing(claim.claim_id)} />
          <DetailItem term="Policy ID" value={textOrMissing(claim.policy_id)} />
          <DetailItem
            term="Creation date"
            value={formatDate(claim.created_at) ?? MISSING}
          />
          <DetailItem
            term="Policy state"
            value={textOrMissing(claim.policy_state)}
          />
          <DetailItem
            term="Claim amount"
            value={formatCurrency(claim.claim_amount) ?? MISSING}
          />
          <DetailItem
            term="Incident type"
            value={textOrMissing(claim.incident_type)}
          />
          <DetailItem
            term="Incident date"
            value={formatDate(claim.incident_date) ?? MISSING}
          />
        </dl>
        <p className="text-xs text-ink-500">
          Retrieved from stored claim records only. This page does not run an
          analysis and makes no judgement about fraud or safety.
        </p>
      </CardContent>
      <CardFooter>
        <Button variant="secondary" onClick={onSearchAnother}>
          <LookupIcon width={16} height={16} />
          Search another claim
        </Button>
      </CardFooter>
    </Card>
  )
}

/**
 * Claim Lookup page.
 *
 * Retrieves a previously saved claim by its claim ID via
 * `GET /api/v1/claims/{claim_id}`. It never runs an analysis and never treats a
 * failure as an empty result. Out-of-order responses are discarded so an older
 * request can never overwrite a newer search.
 */
export function ClaimLookupPage() {
  const [query, setQuery] = useState('')
  const [validationError, setValidationError] = useState<string | undefined>(
    undefined,
  )
  const [state, setState] = useState<LookupState>({ status: 'idle' })
  const [announcement, setAnnouncement] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  // The in-flight request id (used to reject duplicate submissions of the same
  // search) and a monotonic token (used to discard superseded responses).
  const inFlight = useRef<{ id: string; token: number } | null>(null)
  const requestSeq = useRef(0)

  const loading = state.status === 'loading'

  const focusInput = () => {
    formRef.current
      ?.querySelector<HTMLInputElement>('[name="claimId"]')
      ?.focus()
  }

  /** Run one lookup. `id` must already be trimmed and non-empty. */
  const runLookup = async (id: string) => {
    // Ignore a duplicate submission of the same search while it is running.
    const active = inFlight.current
    if (active !== null && active.id === id) return

    setValidationError(undefined)
    const token = ++requestSeq.current
    inFlight.current = { id, token }
    setState({ status: 'loading', claimId: id })
    setAnnouncement(`Looking up claim ${id}.`)

    try {
      const claim = await getClaimById(id)
      // A newer search has started; discard this stale response.
      if (token !== requestSeq.current) return
      setState({ status: 'found', claimId: id, claim })
      setAnnouncement(`Claim ${id} found.`)
    } catch (error) {
      if (token !== requestSeq.current) return
      const info = toLookupError(error)
      setState({ status: 'error', claimId: id, error: info })
      setAnnouncement(info.message)
    } finally {
      if (inFlight.current?.token === token) inFlight.current = null
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const id = query.trim()
    if (id === '') {
      setValidationError('Enter a claim ID to search.')
      setAnnouncement('Enter a claim ID to search.')
      focusInput()
      return
    }
    void runLookup(id)
  }

  const handleChange = (value: string) => {
    setQuery(value)
    if (validationError !== undefined) setValidationError(undefined)
  }

  const handleSearchAnother = () => {
    setQuery('')
    setValidationError(undefined)
    setState({ status: 'idle' })
    setAnnouncement('Ready to search for another claim.')
    focusInput()
  }

  return (
    <>
      <PageHeader
        eyebrow="Retrieve"
        title="Claim Lookup"
        description="Retrieve a previously saved claim by its claim ID."
      />

      <Callout tone="info" title="Decision support only">
        Looking up a claim only retrieves stored data for a human claims
        officer. Finding a claim does not mean it is fraudulent or safe.
      </Callout>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <form
        ref={formRef}
        noValidate
        autoComplete="off"
        aria-label="Claim lookup form"
        onSubmit={handleSubmit}
      >
        <Card>
          <CardHeader>
            <CardHeading
              title="Find a saved claim"
              description="Enter the claim ID of an existing saved claim to retrieve its stored details."
              icon={<LookupIcon width={16} height={16} />}
            />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:flex-1">
                <FormField
                  label="Claim ID"
                  hint="The identifier assigned when the claim was saved."
                  error={validationError}
                  required
                >
                  {({ id, describedBy, invalid }) => (
                    <Input
                      id={id}
                      name="claimId"
                      type="text"
                      value={query}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="e.g. CLM-000123"
                      aria-describedby={describedBy}
                      invalid={invalid}
                      onChange={(event) => handleChange(event.target.value)}
                    />
                  )}
                </FormField>
              </div>
              <Button
                type="submit"
                disabled={loading}
                aria-busy={loading}
                className="sm:mb-6"
              >
                {loading ? (
                  <>
                    <Spinner />
                    Searching…
                  </>
                ) : (
                  <>
                    <LookupIcon width={16} height={16} />
                    Search
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <LookupResult
        state={state}
        onSearchAnother={handleSearchAnother}
        onRetry={(claimId) => void runLookup(claimId)}
      />
    </>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  )
}

function LookupResult({
  state,
  onSearchAnother,
  onRetry,
}: {
  state: LookupState
  onSearchAnother: () => void
  onRetry: (claimId: string) => void
}) {
  if (state.status === 'found') {
    return (
      <ClaimDetailsPanel
        claim={state.claim}
        claimId={state.claimId}
        onSearchAnother={onSearchAnother}
      />
    )
  }

  const copy = state.status === 'error' ? errorCopy(state.error) : null

  return (
    <div className="rounded-lg border border-dashed border-ink-200">
      {state.status === 'idle' ? (
        <StatePanel
          title="No claim selected"
          description="Enter a claim ID above to retrieve its stored details. Nothing is shown until a claim is retrieved."
        />
      ) : null}

      {state.status === 'loading' ? (
        <StatePanel
          variant="loading"
          title="Looking up claim…"
          description={`Retrieving “${state.claimId}” from the claims database.`}
        />
      ) : null}

      {state.status === 'error' && copy ? (
        <StatePanel
          variant="error"
          title={copy.title}
          description={copy.description}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onRetry(state.claimId)}
            >
              Try again
            </Button>
          }
        />
      ) : null}
    </div>
  )
}
