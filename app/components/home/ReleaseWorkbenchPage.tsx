import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, type FormEvent } from "react";
import type { ReleaseInput } from "../../../server/release-domain";

type ReleaseInputForm = Omit<ReleaseInput, "failedTests" | "evidenceReferences"> & {
  failedTests: string;
  evidenceReferences: string;
};

const SAMPLE_RELEASE: ReleaseInputForm = {
  releaseId: "release-2026.10.26.1",
  serviceName: "payments-api",
  ciStatus: "PASS" as const,
  failedTests: "0",
  errorSummary: "Synthetic fixture: no error summary supplied.",
  evidenceReferences: "ci://run/4831\ntests://suite/4831",
};

const statusTone: Record<string, string> = {
  READY: "border-primary/30 bg-primary/10 text-primary",
  REVIEW_REQUIRED: "border-border bg-muted text-foreground",
  BLOCKED: "border-destructive/30 bg-destructive/10 text-destructive",
  PROPOSED: "border-border bg-muted text-foreground",
  APPROVED: "border-primary/30 bg-primary/10 text-primary",
  REJECTED: "border-destructive/30 bg-destructive/10 text-destructive",
  EXECUTED: "border-primary/30 bg-primary/10 text-primary",
  LOW: "border-primary/30 bg-primary/10 text-primary",
  MEDIUM: "border-border bg-muted text-foreground",
  HIGH: "border-destructive/30 bg-destructive/10 text-destructive",
};

function Badge({ value }: { value: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone[value] ?? "border-border bg-muted text-foreground"}`}
    >
      {value.replace(/_/g, " ")}
    </span>
  );
}

function timestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ReleaseWorkbenchPage() {
  const [form, setForm] = useState<ReleaseInputForm>(SAMPLE_RELEASE);
  const [planIntent, setPlanIntent] = useState(
    "Read the service-demo record to review the synthetic release evidence.",
  );
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [actionError, setActionError] = useState("");
  const [aigError, setAigError] = useState("");
  const [aigResult, setAigResult] = useState<unknown>(null);

  const workQuery = useActionQuery("list-releases", {});
  const analyze = useActionMutation("analyze-release");
  const approve = useActionMutation("approve-release");
  const reject = useActionMutation("reject-release");
  const execute = useActionMutation("execute-release");
  const plan = useActionMutation("plan-with-aig");

  const activeRelease = workQuery.data?.releases.find(
    (release) => release.releaseId === selectedReleaseId,
  ) ?? workQuery.data?.releases[0];
  const activeEvents = workQuery.data?.auditEvents.filter(
    (event) => event.releaseId === activeRelease?.releaseId,
  ) ?? [];
  const pending =
    analyze.isPending || approve.isPending || reject.isPending || execute.isPending;

  function update<K extends keyof ReleaseInputForm>(key: K, value: ReleaseInputForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setActionError("");
    const failedTests = Number(form.failedTests);
    if (!Number.isInteger(failedTests) || failedTests < 0) {
      setActionError("Failed tests must be a non-negative whole number.");
      return;
    }
    try {
      const result = await analyze.mutateAsync({
        releaseId: form.releaseId,
        serviceName: form.serviceName,
        ciStatus: form.ciStatus,
        failedTests,
        errorSummary: form.errorSummary,
        evidenceReferences: form.evidenceReferences
          .split(/\r?\n/)
          .map((reference) => reference.trim())
          .filter(Boolean),
      });
      setSelectedReleaseId(result.release.releaseId);
      await workQuery.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Release analysis failed.");
    }
  }

  async function transition(
    operation: "approve" | "reject" | "execute",
    releaseId: string,
  ) {
    if (pending) return;
    setActionError("");
    try {
      if (operation === "approve") await approve.mutateAsync({ releaseId });
      if (operation === "reject") await reject.mutateAsync({ releaseId });
      if (operation === "execute") await execute.mutateAsync({ releaseId });
      await workQuery.refetch();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The release action failed.");
      await workQuery.refetch();
    }
  }

  async function requestAigPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (plan.isPending) return;
    setAigError("");
    setAigResult(null);
    try {
      setAigResult(await plan.mutateAsync({ intent: planIntent }));
    } catch (error) {
      setAigError(error instanceof Error ? error.message : "AIG planning failed.");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Release review</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Release Decision Workbench</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Turn supplied CI facts into a deterministic decision, review the saved plan, then approve or reject its local reference validation.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setForm(SAMPLE_RELEASE)}>
          Load synthetic sample
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>CI evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={submitRelease}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="release-id">Release ID</Label>
                  <Input
                    id="release-id"
                    value={form.releaseId}
                    onChange={(event) => update("releaseId", event.target.value)}
                    maxLength={80}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="service-name">Service name</Label>
                  <Input
                    id="service-name"
                    value={form.serviceName}
                    onChange={(event) => update("serviceName", event.target.value)}
                    maxLength={120}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="ci-status">CI status</Label>
                  <select
                    id="ci-status"
                    className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    value={form.ciStatus}
                    onChange={(event) => update("ciStatus", event.target.value as ReleaseInputForm["ciStatus"])}
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                    <option value="UNKNOWN">UNKNOWN</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="failed-tests">Failed tests</Label>
                  <Input
                    id="failed-tests"
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={form.failedTests}
                    onChange={(event) => update("failedTests", event.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="error-summary">Error summary</Label>
                <textarea
                  id="error-summary"
                  className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                  value={form.errorSummary}
                  onChange={(event) => update("errorSummary", event.target.value)}
                  maxLength={2000}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Displayed as supplied; this text does not change the risk decision.
                </p>
              </div>
              <div>
                <Label htmlFor="evidence-references">Evidence references</Label>
                <textarea
                  id="evidence-references"
                  className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm shadow-sm"
                  value={form.evidenceReferences}
                  onChange={(event) => update("evidenceReferences", event.target.value)}
                  aria-describedby="evidence-help"
                />
                <p id="evidence-help" className="mt-1 text-xs text-muted-foreground">
                  One reference per line. The sample references are synthetic.
                </p>
              </div>
              {actionError ? (
                <p role="alert" className="text-sm text-destructive">{actionError}</p>
              ) : null}
              <Button type="submit" disabled={pending || analyze.isPending}>
                {analyze.isPending ? "Analyzing…" : "Analyze release"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>Release summary</CardTitle>
            {activeRelease ? <Badge value={activeRelease.decision} /> : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {workQuery.data?.releases.length ? (
              <div>
                <Label htmlFor="saved-release">Saved release</Label>
                <select
                  id="saved-release"
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={activeRelease?.releaseId ?? ""}
                  onChange={(event) => setSelectedReleaseId(event.target.value)}
                  disabled={pending}
                >
                  {workQuery.data.releases.map((release) => (
                    <option key={release.id} value={release.releaseId}>{release.releaseId} · {release.status}</option>
                  ))}
                </select>
              </div>
            ) : null}
            {workQuery.isPending ? (
              <p className="text-sm text-muted-foreground">Loading saved releases…</p>
            ) : workQuery.isError ? (
              <div role="alert" className="text-sm text-destructive">
                <p>{workQuery.error instanceof Error ? workQuery.error.message : "Could not load saved releases."}</p>
                <Button type="button" variant="outline" className="mt-2" onClick={() => void workQuery.refetch()}>Retry loading</Button>
              </div>
            ) : activeRelease ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{activeRelease.releaseId}</span>
                  <span className="text-sm text-muted-foreground">{activeRelease.serviceName}</span>
                  <Badge value={activeRelease.riskLevel} />
                  <Badge value={activeRelease.status} />
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">CI status</dt>
                    <dd className="mt-1 font-medium">{activeRelease.ciStatus} · {activeRelease.failedTests} failed tests</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Approval</dt>
                    <dd className="mt-1 font-medium">
                      {activeRelease.status === "APPROVED" || activeRelease.status === "EXECUTED"
                        ? `Approved by ${activeRelease.approvedBy ?? "workbench user"}`
                        : activeRelease.status === "REJECTED"
                          ? "Rejected"
                          : "Not approved"}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-xs text-muted-foreground">Error summary</dt>
                    <dd className="mt-1 whitespace-pre-wrap text-sm">{activeRelease.errorSummary || "None supplied."}</dd>
                  </div>
                </dl>
                <section>
                  <h2 className="text-sm font-semibold">Evidence</h2>
                  {activeRelease.evidenceReferences.length ? (
                    <ul className="mt-2 space-y-1">
                      {activeRelease.evidenceReferences.map((reference) => (
                        <li key={reference} className="break-all rounded bg-muted px-3 py-2 font-mono text-xs">
                          {reference}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No evidence references supplied.</p>
                  )}
                </section>
                <section>
                  <h2 className="text-sm font-semibold">Decision reasons</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {activeRelease.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                  </ul>
                  <h3 className="mt-4 text-sm font-semibold">Recommended action</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {activeRelease.recommendedActions.map((action) => <li key={action}>{action}</li>)}
                  </ul>
                </section>
                <details className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Review saved plan</summary>
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">SHA-256: {activeRelease.planDigest}</p>
                  <pre className="mt-3 max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(activeRelease.plan, null, 2)}</pre>
                </details>
                {activeRelease.executionResult ? (
                  <section className="rounded-lg border border-border bg-muted/40 p-3">
                    <h2 className="text-sm font-semibold">Execution result</h2>
                    <p className="mt-1 text-sm">{activeRelease.executionResult.action}: {activeRelease.executionResult.outcome}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Completed {timestamp(activeRelease.executionResult.completedAt)}. References syntax-checked: {activeRelease.executionResult.validatedReferences.length}. No evidence was fetched; deployment performed: no.
                    </p>
                  </section>
                ) : null}
                {activeRelease.status === "PROPOSED" ? (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                    <Button
                      type="button"
                      disabled={pending || activeRelease.decision === "BLOCKED"}
                      onClick={() => void transition("approve", activeRelease.releaseId)}
                    >
                      Approve plan
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void transition("reject", activeRelease.releaseId)}
                    >
                      Reject plan
                    </Button>
                  </div>
                ) : null}
                {activeRelease.status === "APPROVED" ? (
                  <div className="border-t border-border pt-4">
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => void transition("execute", activeRelease.releaseId)}
                    >
                      {execute.isPending ? "Validating…" : "Run local reference validation"}
                    </Button>
                  </div>
                ) : null}
                <section className="border-t border-border pt-4">
                  <h2 className="text-sm font-semibold">Audit timeline</h2>
                  {activeEvents.length ? (
                    <ol className="mt-3 space-y-3">
                      {activeEvents.map((item) => (
                        <li key={item.id} className="flex gap-3 text-sm">
                          <Badge value={item.eventType} />
                          <div>
                            <p>{item.detail}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {item.actor} · {timestamp(item.createdAt)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No audit events recorded.</p>
                  )}
                </section>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
                Analyze a release to create the first proposal.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AIG plan preview</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={requestAigPlan}>
            <Label htmlFor="aig-intent">Read-only planning intent</Label>
            <textarea
              id="aig-intent"
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
              value={planIntent}
              onChange={(event) => setPlanIntent(event.target.value)}
              maxLength={8192}
              required
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="outline" disabled={plan.isPending}>
                {plan.isPending ? "Requesting plan…" : "Generate AIG plan"}
              </Button>
              <span className="text-xs text-muted-foreground">
                AIG v0.3.0 · local model · planning only · no execution
              </span>
            </div>
          </form>
          {aigError ? <p role="alert" className="mt-3 text-sm text-destructive">{aigError}</p> : null}
          {aigResult ? (
            <pre className="mt-4 max-h-96 overflow-auto rounded-lg bg-muted p-4 text-xs">
              {JSON.stringify(aigResult, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Phase 0 uses synthetic CI references and a local syntax-validation action. It does not fetch evidence, deploy software, or contact production systems.
      </p>
    </main>
  );
}
