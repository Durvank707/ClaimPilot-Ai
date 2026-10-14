import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { Callout } from '../components/ui/Callout'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { ShieldIcon } from '../components/icons'
import { ClaimFieldInput } from '../features/claimAnalysis/ClaimFieldInput'
import {
  CLAIM_SECTIONS,
  EMPTY_CLAIM_FORM,
  fieldsForSection,
  type ClaimFieldName,
  type ClaimFormErrors,
  type ClaimFormValues,
} from '../features/claimAnalysis/claimForm'
import {
  countErrors,
  firstInvalidField,
  validateClaimForm,
} from '../features/claimAnalysis/validateClaimForm'
import { toClaimRequest } from '../features/claimAnalysis/toClaimRequest'
import { AnalysisResultsDashboard } from '../features/claimAnalysis/AnalysisResultsDashboard'
import {
  describeSubmitError,
  submitClaim,
  type ClaimAnalysisResponse,
  type SubmitErrorInfo,
} from '../api/claims'

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; response: ClaimAnalysisResponse }
  | { status: 'error'; info: SubmitErrorInfo }

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  )
}

/**
 * New Claim Analysis form.
 *
 * Validates input client-side, then submits to `POST /api/v1/claims/analyze`.
 * On success it shows only the identifiers the backend actually returns — the
 * detailed risk/severity/explanation dashboard is a later step. It never
 * auto-retries a submission: a timeout or network failure may still have been
 * processed by the server, so the user decides whether to try again.
 */
export function NewClaimPage() {
  const [values, setValues] = useState<ClaimFormValues>(EMPTY_CLAIM_FORM)
  const [errors, setErrors] = useState<ClaimFormErrors>({})
  const [attempted, setAttempted] = useState(false)
  const [submission, setSubmission] = useState<SubmissionState>({
    status: 'idle',
  })
  const [announcement, setAnnouncement] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const focusNextInvalid = useRef(false)
  // Synchronous guard so a rapid double-activation cannot start two requests.
  const inFlight = useRef(false)

  // Move focus to the first invalid field after a failed submit attempt.
  useEffect(() => {
    if (!focusNextInvalid.current) return
    focusNextInvalid.current = false
    const field = firstInvalidField(errors)
    const control = field
      ? formRef.current?.querySelector<HTMLElement>(`[name="${field.name}"]`)
      : null
    control?.focus()
  }, [errors])

  const handleChange = (name: ClaimFieldName, value: string) => {
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => {
      if (current[name] === undefined) return current
      const next = { ...current }
      delete next[name]
      return next
    })
    // Clear a stale submission error once the user edits the input.
    setSubmission((current) =>
      current.status === 'error' ? { status: 'idle' } : current,
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return

    const nextErrors = validateClaimForm(values)
    setAttempted(true)
    setErrors(nextErrors)
    const nextErrorCount = countErrors(nextErrors)
    if (nextErrorCount > 0) {
      focusNextInvalid.current = true
      setSubmission({ status: 'idle' })
      setAnnouncement(
        `Submission blocked. ${nextErrorCount} field${
          nextErrorCount === 1 ? '' : 's'
        } need attention.`,
      )
      return
    }

    inFlight.current = true
    setSubmission({ status: 'submitting' })
    setAnnouncement('Submitting the claim for analysis.')

    try {
      const response = await submitClaim(toClaimRequest(values))
      setSubmission({ status: 'success', response })
      setAnnouncement('Analysis submitted.')
    } catch (error) {
      const info = describeSubmitError(error)
      if (Object.keys(info.fieldErrors).length > 0) {
        setErrors((current) => ({
          ...current,
          ...(info.fieldErrors as ClaimFormErrors),
        }))
        focusNextInvalid.current = true
      }
      setSubmission({ status: 'error', info })
      setAnnouncement('The claim could not be submitted for analysis.')
    } finally {
      inFlight.current = false
    }
  }

  const handleReset = () => {
    inFlight.current = false
    setValues(EMPTY_CLAIM_FORM)
    setErrors({})
    setAttempted(false)
    setSubmission({ status: 'idle' })
    setAnnouncement('Form cleared.')
  }

  const errorCount = countErrors(errors)
  const submitting = submission.status === 'submitting'
  const isRetry = submission.status === 'error'

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="New Claim Analysis"
        description="Enter the claim details to prepare an analysis for a human claims officer."
      />

      <Callout tone="info" title="Decision support only">
        Submitted claim details are analysed to support a human claims officer.
        ClaimPilot never approves, rejects or accuses — it does not decide that
        a claim is fraudulent, and every result requires a human decision.
      </Callout>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {submission.status === 'success' ? (
        <AnalysisResultsDashboard
          response={submission.response}
          onStartAnother={handleReset}
        />
      ) : (
        <form
          ref={formRef}
          noValidate
          autoComplete="off"
          aria-label="New claim analysis form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-6"
        >
          {submission.status === 'error' ? (
            <SubmitErrorCallout info={submission.info} />
          ) : null}

          {attempted && errorCount > 0 ? (
            <div
              role="alert"
              className="rounded-lg border border-[#f1c3be] bg-status-criticalBg px-4 py-3 text-sm text-navy-800"
            >
              <p className="font-semibold">
                Check {errorCount} field{errorCount === 1 ? '' : 's'} before
                submitting.
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-600">
                {(Object.entries(errors) as Array<[string, string]>).map(
                  ([name, message]) => (
                    <li key={name}>{message}</li>
                  ),
                )}
              </ul>
            </div>
          ) : null}

          {CLAIM_SECTIONS.map((section) => (
            <Card key={section.id}>
              <fieldset
                className="min-w-0 border-0 p-5"
                disabled={submitting}
              >
                <legend className="w-full border-b border-ink-200 pb-3 text-sm font-semibold text-navy-900">
                  {section.title}
                </legend>
                <p className="mt-2 text-xs text-ink-500">
                  {section.description}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {fieldsForSection(section.id).map((field) => (
                    <ClaimFieldInput
                      key={field.name}
                      field={field}
                      value={values[field.name]}
                      error={errors[field.name]}
                      onChange={handleChange}
                    />
                  ))}
                </div>
              </fieldset>
            </Card>
          ))}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs text-ink-500">
              Fields marked with <span aria-hidden="true">*</span> are required.
              The claim is sent to the analysis service, which returns a result
              for a human officer to review; the detailed result view arrives in
              the next step.
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={handleReset}
                disabled={submitting}
              >
                Reset
              </Button>
              <Button type="submit" disabled={submitting} aria-busy={submitting}>
                {submitting ? (
                  <>
                    <Spinner />
                    Analysing…
                  </>
                ) : isRetry ? (
                  'Try again'
                ) : (
                  'Analyse claim'
                )}
              </Button>
            </div>
          </div>
        </form>
      )}
    </>
  )
}

function SubmitErrorCallout({ info }: { info: SubmitErrorInfo }) {
  const fieldMessages = Object.values(info.fieldErrors)

  return (
    <Callout
      tone="warning"
      title="The claim could not be analysed"
      icon={<ShieldIcon width={18} height={18} />}
    >
      <p>{info.message}</p>
      {fieldMessages.length > 0 ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {fieldMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      {info.uncertain ? (
        <p className="mt-1">
          The request did not complete, so the server may still have processed
          this claim. Check before trying again — nothing is retried
          automatically.
        </p>
      ) : null}
    </Callout>
  )
}


