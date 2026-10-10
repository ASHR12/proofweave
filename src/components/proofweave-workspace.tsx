"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CustomReportExport } from "@/components/custom-report-export";
import { Icon, WeaveMark } from "@/components/icons";
import { useResearchRun } from "@/hooks/use-research-run";
import { useReports } from "@/hooks/use-reports";
import {
  NO_SOURCES_MATCH_MESSAGE,
  filterCitations,
} from "@/lib/citation-filter";
import { stripProviderCitationTokens } from "@/lib/citation-presentation";
import {
  downloadMarkdown,
  downloadNormalizedJson,
} from "@/lib/report-export";
import {
  RUN_STATUSES,
  type Citation,
  type ResearchReport,
  type RunStatus,
} from "@/types/report";
import type { ResearchRunSnapshot } from "@/types/research";

import styles from "./workspace.module.css";

type WorkspaceArea = "new" | "reader" | "library";

const SUGGESTED_QUESTIONS = [
  "Compare GLM 5.3 and Kimi K3 for coding agents.",
  "Map the evidence behind a product decision.",
  "Trace how a technical standard evolved.",
  "Compare two approaches using primary sources.",
];

const STATUS_DETAILS: Record<
  RunStatus,
  { title: string; description: string }
> = {
  idle: {
    title: "Idle",
    description: "The question is editable and no run exists.",
  },
  queued: {
    title: "Queued",
    description: "A provider has accepted the request.",
  },
  researching: {
    title: "Researching",
    description: "Sources and claims are being gathered.",
  },
  reconnecting: {
    title: "Reconnecting",
    description: "The workspace is restoring a run stream.",
  },
  completed: {
    title: "Completed",
    description: "A normalized report is ready to read.",
  },
  failed: {
    title: "Failed",
    description: "The run stopped with a recoverable record.",
  },
  cancelled: {
    title: "Cancelled",
    description: "The user stopped the run before completion.",
  },
};

function formatStatus(status: RunStatus) {
  return status === "idle"
    ? "Idle"
    : status === "queued"
      ? "Queued"
      : status === "researching"
        ? "Researching"
        : status === "reconnecting"
          ? "Reconnecting"
          : status === "completed"
            ? "Completed"
            : status === "failed"
              ? "Failed"
              : "Cancelled";
}

function statusContext(status: RunStatus) {
  if (status === "queued") return "Waiting for provider";
  if (status === "reconnecting") return "Waiting for provider";
  if (status === "researching") return "Gathering evidence";
  if (status === "completed") return "Report available";
  if (status === "failed") return "Attention needed";
  if (status === "cancelled") return "Run stopped";
  return "Ready for a question";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDuration(report: ResearchReport) {
  if (report.durationSeconds === undefined) {
    return "No live run";
  }

  const minutes = Math.floor(report.durationSeconds / 60);
  const seconds = report.durationSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function citationFor(
  report: ResearchReport,
  citationId: string,
): Citation | undefined {
  return report.citations.find(({ id }) => id === citationId);
}

interface CitationMarkersProps {
  report: ResearchReport;
  citationIds: string[];
  onOpen: (citationId: string) => void;
}

function CitationMarkers({
  report,
  citationIds,
  onOpen,
}: CitationMarkersProps) {
  if (citationIds.length === 0) return null;

  return (
    <span className={styles.citationMarkers} aria-label="Citations">
      {citationIds.map((citationId) => {
        const citation = citationFor(report, citationId);
        if (!citation) return null;

        return (
          <button
            className={styles.citationMarker}
            key={citationId}
            onClick={() => onOpen(citationId)}
            title={`Open evidence ${citation.marker}: ${stripProviderCitationTokens(citation.title)}`}
            type="button"
          >
            {citation.marker}
          </button>
        );
      })}
    </span>
  );
}

interface NewResearchProps {
  onStart: (question: string, scope: string) => Promise<unknown>;
  onCancel: () => Promise<void>;
  onOpenReport: (reportId: string) => Promise<void>;
  run: ResearchRunSnapshot | null;
  isStarting: boolean;
  isRunning: boolean;
  error: string | null;
}

function NewResearch({
  onStart,
  onCancel,
  onOpenReport,
  run,
  isStarting,
  isRunning,
  error,
}: NewResearchProps) {
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState("");
  const confirmationRef = useRef<HTMLDialogElement>(null);

  async function confirmStart() {
    confirmationRef.current?.close();
    await onStart(question, scope);
  }

  return (
    <div className={styles.areaFrame}>
      <section className={styles.newHero} aria-labelledby="new-research-title">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>New research</span>
          <h1 id="new-research-title">
            Begin with a question
            <br />
            worth tracing.
          </h1>
          <p>
            Shape the brief now. Proofweave will later turn a provider run into
            a durable, cited report you can reopen and export.
          </p>
        </div>

        <div className={styles.composerCard}>
          <div className={styles.composerTopline}>
            <span>Research question</span>
            <span className={styles.localPill}>Deep Research Preview</span>
          </div>
          <label className={styles.srOnly} htmlFor="research-question">
            Research question
          </label>
          <textarea
            autoComplete="off"
            id="research-question"
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="What do you want to understand?"
            rows={5}
            value={question}
          />

          <div className={styles.suggestions}>
            <p>Try a starting point</p>
            <div className={styles.suggestionList}>
              {SUGGESTED_QUESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setQuestion(suggestion)}
                  type="button"
                >
                  <Icon name="plus" size={15} />
                  <span>{suggestion}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.scopeField}>
            <label htmlFor="research-scope">
              Scope &amp; instructions <span>optional</span>
            </label>
            <textarea
              id="research-scope"
              onChange={(event) => setScope(event.target.value)}
              placeholder="Preferred sources, time range, exclusions, or output shape…"
              rows={3}
              value={scope}
            />
          </div>

          <div className={styles.composerFooter}>
            <div className={styles.previewNotice} id="start-research-note">
              <Icon name="spark" size={17} />
              <span>
                <strong>Google Deep Research is connected.</strong> Preview
                tasks can take several minutes and may use paid research
                capacity. You will confirm before submission.
              </span>
            </div>
            <button
              aria-describedby="start-research-note"
              className={styles.startButton}
              disabled={!question.trim() || isStarting || isRunning}
              onClick={() => confirmationRef.current?.showModal()}
              type="button"
            >
              {isStarting
                ? "Starting…"
                : isRunning
                  ? "Research in progress"
                  : "Start deep research"}
              <Icon name="arrow" />
            </button>
          </div>

          {(run || error) && (
            <section
              aria-live="polite"
              className={styles.liveRunPanel}
              data-status={run?.status ?? "failed"}
            >
              <div className={styles.liveRunHeader}>
                <div>
                  <span className={styles.statusDot} />
                  <span>
                    <small>Current run</small>
                    <strong>
                      {run ? formatStatus(run.status) : "Unable to start"}
                    </strong>
                  </span>
                </div>
                <div className={styles.liveRunActions}>
                  {run?.recovered && (
                    <span className={styles.recoveredBadge}>
                      Recovered after restart
                    </span>
                  )}
                  {run?.reportId && (
                    <button
                      className={styles.textButton}
                      onClick={() => void onOpenReport(run.reportId as string)}
                      type="button"
                    >
                      Open completed report
                    </button>
                  )}
                  {isRunning && (
                    <button
                      className={styles.textButton}
                      onClick={() => void onCancel()}
                      type="button"
                    >
                      Cancel run
                    </button>
                  )}
                </div>
              </div>
              {run && (
                <dl className={styles.liveRunMeta}>
                  <div>
                    <dt>Provider</dt>
                    <dd>{run.providerLabel}</dd>
                  </div>
                  <div>
                    <dt>Agent</dt>
                    <dd>{run.providerAgent}</dd>
                  </div>
                  <div>
                    <dt>Run ID</dt>
                    <dd>{run.id}</dd>
                  </div>
                </dl>
              )}
              {error && (
                <p className={styles.runError} role="alert">
                  {error}
                </p>
              )}
              {run?.error && (
                <p className={styles.runError} role="alert">
                  {run.error}
                </p>
              )}
              {run && run.progress.length > 0 && (
                <ol className={styles.progressMessages}>
                  {run.progress.slice(-5).map((item) => (
                    <li key={`${item.occurredAt}-${item.message}`}>
                      <span />
                      <p>{item.message}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </div>
      </section>

      <section
        className={styles.lifecycleSection}
        aria-labelledby="lifecycle-title"
      >
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>Run language</span>
            <h2 id="lifecycle-title">Every state has a clear place.</h2>
          </div>
        </div>

        <ol className={styles.statusAtlas}>
          {RUN_STATUSES.map((status) => (
            <li data-status={status} key={status}>
              <span className={styles.statusDot} />
              <div>
                <strong>{STATUS_DETAILS[status].title}</strong>
                <span>{STATUS_DETAILS[status].description}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.boundaryStrip} aria-label="Milestone boundary">
        <div>
          <Icon name="database" size={20} />
          <span>
            <strong>Local report store</strong>
            Atomic JSON files on this machine
          </span>
        </div>
        <div>
          <Icon name="evidence" size={20} />
          <span>
            <strong>Normalized evidence</strong>
            Citations preserved across exports
          </span>
        </div>
        <div>
          <Icon name="spark" size={20} />
          <span>
            <strong>Server-owned provider</strong>
            Credentials never enter the browser
          </span>
        </div>
      </section>

      <dialog
        aria-labelledby="confirm-research-title"
        className={styles.deleteDialog}
        onCancel={(event) => {
          event.preventDefault();
          confirmationRef.current?.close();
        }}
        ref={confirmationRef}
      >
        <div className={styles.dialogSeal}>
          <Icon name="spark" size={20} />
        </div>
        <span className={styles.eyebrow}>Deep Research Preview</span>
        <h2 id="confirm-research-title">Start this paid preview task?</h2>
        <p>
          Google may charge for this Deep Research Preview interaction. It can
          run for several minutes in the background. Proofweave will save the
          cited result locally when it completes.
        </p>
        <div>
          <button
            autoFocus
            className={styles.secondaryButton}
            onClick={() => confirmationRef.current?.close()}
            type="button"
          >
            Review question
          </button>
          <button
            className={styles.startButton}
            disabled={isStarting || isRunning}
            onClick={() => void confirmStart()}
            type="button"
          >
            Confirm and start
          </button>
        </div>
      </dialog>
    </div>
  );
}

interface ReportReaderProps {
  report: ResearchReport | null;
  isLoading: boolean;
  error: string | null;
  onOpenEvidence: (citationId?: string) => void;
  onSaveCopy: () => Promise<void>;
  saveMessage: string | null;
  isSaving: boolean;
}

function AuthoritativeMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className={styles.markdownBody}>
      <ReactMarkdown
        components={{
          a: ({ children, ...props }) => (
            <a {...props} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
        }}
        remarkPlugins={[remarkGfm]}
      >
        {stripProviderCitationTokens(markdown)}
      </ReactMarkdown>
    </div>
  );
}

function ReportReader({
  report,
  isLoading,
  error,
  onOpenEvidence,
  onSaveCopy,
  saveMessage,
  isSaving,
}: ReportReaderProps) {
  if (isLoading) {
    return (
      <div className={styles.centerState} role="status">
        <span className={styles.loadingSeal} />
        <h1>Opening the notebook…</h1>
        <p>Loading local report records.</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className={styles.centerState}>
        <Icon name="file" size={28} />
        <h1>No report is open.</h1>
        <p>{error ?? "Choose a report from the library to read it here."}</p>
      </div>
    );
  }

  return (
    <div className={styles.readerFrame}>
      <div className={styles.readerToolbar}>
        <div>
          <span className={styles.readerCrumb}>Report reader</span>
          <span className={styles.readerStatus} data-status={report.status}>
            <span />
            {formatStatus(report.status)}
          </span>
        </div>
        <div className={styles.readerActions}>
          <button
            className={styles.secondaryButton}
            onClick={() => onOpenEvidence()}
            type="button"
          >
            <Icon name="evidence" />
            Evidence
            <span className={styles.countBadge}>{report.citations.length}</span>
          </button>
          <CustomReportExport
            report={report}
            triggerClassName={styles.secondaryButton}
          />
          <button
            className={styles.secondaryButton}
            onClick={() => downloadMarkdown(report)}
            type="button"
          >
            <Icon name="download" />
            Markdown
          </button>
          <button
            className={styles.secondaryButton}
            onClick={() => downloadNormalizedJson(report)}
            type="button"
          >
            <Icon name="download" />
            JSON
          </button>
        </div>
      </div>

      <div className={styles.readerGrid}>
        <aside className={styles.progressRail} aria-label="Report status">
          <div className={styles.railStatus} data-status={report.status}>
            <span className={styles.railStatusIcon}>
              <Icon name="check" size={18} />
            </span>
            <span>
              <small>Current state</small>
              <strong>{formatStatus(report.status)}</strong>
              <em>{statusContext(report.status)}</em>
            </span>
          </div>

          <div className={styles.railTimeline}>
            <span className={styles.railLabel}>Run progress</span>
            <ol>
              {[
                ["01", "Question framed"],
                ["02", "Evidence slots"],
                ["03", "Report normalized"],
                ["04", "Saved locally"],
              ].map(([number, label]) => (
                <li key={number}>
                  <span>{number}</span>
                  <strong>{label}</strong>
                </li>
              ))}
            </ol>
          </div>

          <dl className={styles.railMeta}>
            <div>
              <dt>Provider</dt>
              <dd>{report.provider.label}</dd>
            </div>
            <div>
              <dt>Agent</dt>
              <dd>{report.provider.agent}</dd>
            </div>
            <div>
              <dt>Duration</dt>
              <dd>{formatDuration(report)}</dd>
            </div>
            <div>
              <dt>Run ID</dt>
              <dd>{report.run.id}</dd>
            </div>
          </dl>
        </aside>

        <article className={styles.reportPaper}>
          <header className={styles.reportHeader}>
            <div className={styles.reportKicker}>
              <span>Research brief</span>
              <span>{formatDate(report.updatedAt)}</span>
            </div>
            <h1>{report.title}</h1>
            <p className={styles.reportQuestion}>{report.question}</p>
            <div className={styles.scopeNote}>
              <span>Scope</span>
              <p>{report.scope}</p>
            </div>
          </header>

          {report.executiveSummary.length > 0 && (
            <section
              className={styles.executiveSummary}
              aria-labelledby="executive-summary-title"
            >
              <span className={styles.sectionNumber}>01</span>
              <div>
                <span className={styles.reportEyebrow}>At a glance</span>
                <h2 id="executive-summary-title">Executive summary</h2>
                {report.executiveSummary.map((paragraph) => (
                  <p key={paragraph}>
                    {stripProviderCitationTokens(paragraph)}
                  </p>
                ))}
              </div>
            </section>
          )}

          {report.keyFindings.length > 0 && (
            <section
              className={styles.findingsSection}
              aria-labelledby="key-findings-title"
            >
              <div className={styles.reportSectionTitle}>
                <div>
                  <span className={styles.reportEyebrow}>Signal, separated</span>
                  <h2 id="key-findings-title">Key findings</h2>
                </div>
                <span>{report.keyFindings.length} cards</span>
              </div>
              <div className={styles.findingGrid}>
                {report.keyFindings.map((finding, index) => (
                  <article className={styles.findingCard} key={finding.id}>
                    <div>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <em>{finding.eyebrow}</em>
                    </div>
                    <h3>{stripProviderCitationTokens(finding.title)}</h3>
                    {finding.summary && (
                      <p>
                        {stripProviderCitationTokens(finding.summary)}
                        <CitationMarkers
                          citationIds={finding.citationIds}
                          onOpen={onOpenEvidence}
                          report={report}
                        />
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          {report.comparison.rows.length > 0 && (
            <section
              className={styles.comparisonSection}
              aria-labelledby="comparison-title"
            >
              <div className={styles.reportSectionTitle}>
                <div>
                  <span className={styles.reportEyebrow}>Side by side</span>
                  <h2 id="comparison-title">Comparison frame</h2>
                </div>
                <span>Cited provider output</span>
              </div>
              <div className={styles.tableScroll} tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Criterion</th>
                      <th scope="col">
                        {stripProviderCitationTokens(
                          report.comparison.subjectA,
                        )}
                      </th>
                      <th scope="col">
                        {stripProviderCitationTokens(
                          report.comparison.subjectB,
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.comparison.rows.map((row) => (
                      <tr key={row.criterion}>
                        <th scope="row">
                          {stripProviderCitationTokens(row.criterion)}
                        </th>
                        <td>{stripProviderCitationTokens(row.subjectA)}</td>
                        <td>
                          {stripProviderCitationTokens(row.subjectB)}
                          <CitationMarkers
                            citationIds={row.citationIds}
                            onOpen={onOpenEvidence}
                            report={report}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {!report.authoritative &&
            report.sections.map((section, index) => (
            <section className={styles.proseSection} key={section.id}>
              <span className={styles.sectionNumber}>
                {String(index + 2).padStart(2, "0")}
              </span>
              <div>
                <h2>{stripProviderCitationTokens(section.heading)}</h2>
                {section.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={paragraph}>
                    {stripProviderCitationTokens(paragraph)}
                    {paragraphIndex === section.paragraphs.length - 1 && (
                      <CitationMarkers
                        citationIds={section.citationIds}
                        onOpen={onOpenEvidence}
                        report={report}
                      />
                    )}
                  </p>
                ))}
              </div>
            </section>
          ))}

          {report.authoritative && (
            <section
              className={styles.authoritativeSection}
              aria-labelledby="authoritative-report-title"
            >
              <div className={styles.reportSectionTitle}>
                <div>
                  <span className={styles.reportEyebrow}>Source of truth</span>
                  <h2 id="authoritative-report-title">
                    Authoritative cited report
                  </h2>
                </div>
                <span>Provider Markdown</span>
              </div>
              <AuthoritativeMarkdown markdown={report.authoritative.markdown} />
              {report.normalization &&
                report.normalization.warnings.length > 0 && (
                  <details className={styles.normalizationNote}>
                    <summary>Normalization notes</summary>
                    <ul>
                      {report.normalization.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
            </section>
          )}

          <footer className={styles.reportFooter}>
            <div>
              <WeaveMark />
              <span>
                <strong>Proofweave normalized report</strong>
                Schema v{report.schemaVersion} · {report.citations.length}{" "}
                evidence records
              </span>
            </div>
            <button
              className={styles.saveCopyButton}
              disabled={isSaving || report.origin === "saved"}
              onClick={() => void onSaveCopy()}
              type="button"
            >
              <Icon
                name={
                  report.origin === "saved" || saveMessage
                    ? "check"
                    : "database"
                }
              />
              {report.origin === "saved"
                ? "Saved locally"
                : isSaving
                  ? "Saving…"
                  : saveMessage
                    ? saveMessage
                    : "Save local copy"}
            </button>
          </footer>
        </article>
      </div>
    </div>
  );
}

interface LibraryProps {
  reports: ResearchReport[];
  isLoading: boolean;
  error: string | null;
  onOpen: (reportId: string) => Promise<void>;
  onDeleteRequest: (report: ResearchReport) => void;
}

function Library({
  reports,
  isLoading,
  error,
  onOpen,
  onDeleteRequest,
}: LibraryProps) {
  const [query, setQuery] = useState("");
  const filteredReports = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return reports;

    return reports.filter((report) =>
      [report.title, report.question, report.provider.label]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [query, reports]);
  const durations = reports
    .map(({ durationSeconds }) => durationSeconds ?? 0)
    .filter((duration) => duration > 0)
    .sort();
  const quickestDuration = durations[0];

  return (
    <div className={styles.libraryFrame}>
      <header className={styles.libraryHeader}>
        <div>
          <span className={styles.eyebrow}>Local library</span>
          <h1>Your research, kept within reach.</h1>
          <p>
            Reopen a normalized report, inspect its evidence, or carry it into
            another tool without losing the citation map.
          </p>
        </div>
        <dl className={styles.libraryStats}>
          <div>
            <dt>Reports</dt>
            <dd>{String(reports.length).padStart(2, "0")}</dd>
          </div>
          <div>
            <dt>Local files</dt>
            <dd>
              {String(
                reports.filter(({ origin }) => origin === "saved").length,
              ).padStart(2, "0")}
            </dd>
          </div>
          <div>
            <dt>Quickest run</dt>
            <dd>{quickestDuration ? `${quickestDuration}s` : "—"}</dd>
          </div>
        </dl>
      </header>

      <section className={styles.libraryPanel} aria-labelledby="saved-reports">
        <div className={styles.libraryTools}>
          <div>
            <h2 id="saved-reports">Saved reports</h2>
            <span>
              {filteredReports.length} of {reports.length}
            </span>
          </div>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search saved reports</span>
            <Icon name="search" />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, question, or provider"
              type="search"
              value={query}
            />
          </label>
        </div>

        {isLoading ? (
          <div className={styles.libraryLoading} role="status">
            Reading local report files…
          </div>
        ) : error ? (
          <div className={styles.libraryLoading} role="alert">
            {error}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className={styles.libraryEmpty}>
            <Icon name="book" size={25} />
            <h3>No reports match that search.</h3>
            <p>Try a title, a provider, or a word from the original question.</p>
          </div>
        ) : (
          <div className={styles.reportList}>
            {filteredReports.map((report, index) => (
              <article className={styles.libraryCard} key={report.id}>
                <div className={styles.libraryCardIndex}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className={styles.libraryCardBody}>
                  <div className={styles.libraryCardTopline}>
                    <span
                      className={styles.statusPill}
                      data-status={report.status}
                    >
                      <span />
                      {formatStatus(report.status)}
                    </span>
                  </div>
                  <h3>{report.title}</h3>
                  <p>{report.question}</p>
                  <dl>
                    <div>
                      <dt>Updated</dt>
                      <dd>{formatDate(report.updatedAt)}</dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>{formatDuration(report)}</dd>
                    </div>
                    <div>
                      <dt>Provider</dt>
                      <dd>{report.provider.label}</dd>
                    </div>
                    <div>
                      <dt>Evidence</dt>
                      <dd>{report.citations.length} records</dd>
                    </div>
                  </dl>
                </div>
                <div className={styles.libraryCardActions}>
                  <button
                    className={styles.openReportButton}
                    onClick={() => void onOpen(report.id)}
                    type="button"
                  >
                    Open report
                    <Icon name="arrow" size={16} />
                  </button>
                  <button
                    aria-label={`Delete ${report.title}`}
                    className={styles.deleteButton}
                    onClick={() => onDeleteRequest(report)}
                    title="Delete report"
                    type="button"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface EvidenceDrawerProps {
  isOpen: boolean;
  report: ResearchReport | null;
  selectedCitationId?: string;
  onDismiss: () => void;
}

function EvidenceDrawer({
  isOpen,
  report,
  selectedCitationId,
  onDismiss,
}: EvidenceDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [citationQuery, setCitationQuery] = useState("");
  const [wasOpen, setWasOpen] = useState(isOpen);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setCitationQuery("");
  }

  const citations = report?.citations ?? [];
  const filteredCitations = useMemo(
    () => filterCitations(report?.citations ?? [], citationQuery),
    [report, citationQuery],
  );

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const citationElement = selectedCitationId
      ? document.getElementById(`evidence-${selectedCitationId}`)
      : null;
    citationElement?.scrollIntoView({ block: "nearest" });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [isOpen, onDismiss, selectedCitationId]);

  if (!isOpen || !report) return null;

  return (
    <div className={styles.drawerLayer}>
      <button
        aria-label="Close evidence drawer"
        className={styles.drawerBackdrop}
        onClick={onDismiss}
        type="button"
      />
      <aside
        aria-labelledby="evidence-title"
        aria-modal="true"
        className={styles.evidenceDrawer}
        ref={drawerRef}
        role="dialog"
      >
        <header>
          <div>
            <span className={styles.eyebrow}>Evidence ledger</span>
            <h2 id="evidence-title">Sources &amp; citations</h2>
          </div>
          <button
            aria-label="Close evidence drawer"
            className={styles.iconButton}
            onClick={onDismiss}
            ref={closeButtonRef}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.evidenceTools}>
          <label className={styles.searchField}>
            <span className={styles.srOnly}>Search sources</span>
            <Icon name="search" />
            <input
              onChange={(event) => setCitationQuery(event.target.value)}
              placeholder="Search title, publisher, or excerpt"
              type="search"
              value={citationQuery}
            />
          </label>
          <span aria-live="polite" className={styles.evidenceCount}>
            {filteredCitations.length} of {citations.length} sources
          </span>
        </div>

        <div className={styles.evidenceList}>
          {citations.length === 0 && (
            <p className={styles.emptyEvidence}>
              The provider returned no usable URL citation annotations. The
              report text is preserved without invented evidence.
            </p>
          )}
          {citations.length > 0 && filteredCitations.length === 0 && (
            <p className={styles.emptyEvidence}>
              {NO_SOURCES_MATCH_MESSAGE}
            </p>
          )}
          {filteredCitations.map((citation) => (
            <article
              className={styles.evidenceCard}
              data-selected={selectedCitationId === citation.id}
              id={`evidence-${citation.id}`}
              key={citation.id}
            >
              <div className={styles.evidenceNumber}>
                {String(citation.marker).padStart(2, "0")}
              </div>
              <div>
                <span>{citation.publisher ?? "Source"}</span>
                <h3>{stripProviderCitationTokens(citation.title)}</h3>
                {citation.excerpt &&
                  stripProviderCitationTokens(citation.excerpt) && (
                    <p>{stripProviderCitationTokens(citation.excerpt)}</p>
                  )}
                <a href={citation.url} rel="noreferrer" target="_blank">
                  View source
                  <Icon name="arrow" size={14} />
                </a>
              </div>
            </article>
          ))}
        </div>

        <footer>
          <Icon name="evidence" />
          Citation IDs and source metadata remain intact in Markdown and
          normalized JSON exports.
        </footer>
      </aside>
    </div>
  );
}

interface DeleteDialogProps {
  report: ResearchReport | null;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteDialog({
  report,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}: DeleteDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (report && !dialog.open) dialog.showModal();
    if (!report && dialog.open) dialog.close();
  }, [report]);

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <dialog
      aria-labelledby="delete-report-title"
      className={styles.deleteDialog}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onKeyDown={handleDialogKeyDown}
      ref={dialogRef}
    >
      <div className={styles.dialogSeal}>
        <Icon name="trash" size={20} />
      </div>
      <span className={styles.eyebrow}>Delete local report</span>
      <h2 id="delete-report-title">Remove this report?</h2>
      <p>
        “{report?.title}” will be removed from this machine. Exported files are
        not affected.
      </p>
      {error && (
        <p className={styles.dialogError} role="alert">
          {error}
        </p>
      )}
      <div>
        <button
          autoFocus
          className={styles.secondaryButton}
          disabled={isDeleting}
          onClick={onCancel}
          type="button"
        >
          Keep report
        </button>
        <button
          className={styles.dangerButton}
          disabled={isDeleting}
          onClick={() => void onConfirm()}
          type="button"
        >
          {isDeleting ? "Deleting…" : "Delete report"}
        </button>
      </div>
    </dialog>
  );
}

export default function ProofweaveWorkspace() {
  const {
    reports,
    selectedReport,
    isLoading,
    error,
    reloadReports,
    openReport,
    saveLocalCopy,
    removeReport,
  } = useReports();
  const research = useResearchRun();
  const [activeArea, setActiveArea] = useState<WorkspaceArea>("new");
  const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
  const [selectedCitationId, setSelectedCitationId] = useState<
    string | undefined
  >();
  const [reportToDelete, setReportToDelete] =
    useState<ResearchReport | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const openedCompletedRunRef = useRef<string | null>(null);

  useEffect(() => {
    const completedRun = research.run;
    if (
      completedRun?.status !== "completed" ||
      !completedRun.reportId ||
      openedCompletedRunRef.current === completedRun.id
    ) {
      return;
    }
    openedCompletedRunRef.current = completedRun.id;
    void reloadReports()
      .then(() => openReport(completedRun.reportId as string))
      .then(() => {
        setActiveArea("reader");
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
  }, [openReport, reloadReports, research.run]);

  function openEvidence(citationId?: string) {
    setSelectedCitationId(citationId);
    setIsEvidenceOpen(true);
  }

  async function handleOpenReport(reportId: string) {
    await openReport(reportId);
    setActiveArea("reader");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSaveCopy() {
    if (!selectedReport || isSaving) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      await saveLocalCopy(selectedReport);
      setSaveMessage("Saved to library");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!reportToDelete || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await removeReport(reportToDelete.id);
      setReportToDelete(null);
    } catch (deleteRequestError) {
      setDeleteError(
        deleteRequestError instanceof Error
          ? deleteRequestError.message
          : "The report could not be deleted.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const navigation: {
    id: WorkspaceArea;
    label: string;
    icon: "plus" | "file" | "book";
  }[] = [
    { id: "new", label: "New research", icon: "plus" },
    { id: "reader", label: "Report reader", icon: "file" },
    { id: "library", label: "Library", icon: "book" },
  ];

  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to workspace
      </a>
      <div className={styles.workspaceShell}>
        <header className={styles.topbar}>
          <button
            aria-label="Open new research"
            className={styles.brand}
            onClick={() => setActiveArea("new")}
            type="button"
          >
            <span className={styles.brandMark}>
              <WeaveMark />
            </span>
            <span>
              <strong>Proofweave</strong>
              <small>Personal deep research</small>
            </span>
          </button>

          <nav aria-label="Primary workspace">
            {navigation.map((item) => (
              <button
                aria-current={activeArea === item.id ? "page" : undefined}
                className={activeArea === item.id ? styles.navActive : ""}
                key={item.id}
                onClick={() => setActiveArea(item.id)}
                type="button"
              >
                <Icon name={item.icon} size={16} />
                {item.label}
                {item.id === "library" && reports.length > 0 && (
                  <span>{reports.length}</span>
                )}
              </button>
            ))}
          </nav>

          <div className={styles.localStatus}>
            <span />
            Server connected
          </div>
        </header>

        <main id="main-content" tabIndex={-1}>
          {activeArea === "new" && (
            <NewResearch
              error={research.error}
              isRunning={research.isRunning}
              isStarting={research.isStarting}
              onCancel={research.cancel}
              onOpenReport={handleOpenReport}
              onStart={research.start}
              run={research.run}
            />
          )}
          {activeArea === "reader" && (
            <ReportReader
              error={error}
              isLoading={isLoading}
              isSaving={isSaving}
              onOpenEvidence={openEvidence}
              onSaveCopy={handleSaveCopy}
              report={selectedReport}
              saveMessage={saveMessage}
            />
          )}
          {activeArea === "library" && (
            <Library
              error={error}
              isLoading={isLoading}
              onDeleteRequest={(report) => {
                setDeleteError(null);
                setReportToDelete(report);
              }}
              onOpen={handleOpenReport}
              reports={reports}
            />
          )}
        </main>

        <footer className={styles.siteFooter}>
          <span>Proofweave · Research workspace</span>
          <span>Google research runs server-side; reports stay local.</span>
        </footer>
      </div>

      <EvidenceDrawer
        isOpen={isEvidenceOpen}
        onDismiss={() => setIsEvidenceOpen(false)}
        report={selectedReport}
        selectedCitationId={selectedCitationId}
      />
      <DeleteDialog
        error={deleteError}
        isDeleting={isDeleting}
        onCancel={() => setReportToDelete(null)}
        onConfirm={handleDelete}
        report={reportToDelete}
      />
    </>
  );
}
