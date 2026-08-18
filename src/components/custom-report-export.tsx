"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/icons";
import {
  DEFAULT_REPORT_TEMPLATE,
  downloadRenderedReport,
  renderReportTemplate,
  REPORT_TEMPLATE_FIELDS,
  REPORT_TEMPLATE_STORAGE_KEY,
} from "@/lib/report-template";
import type { ResearchReport } from "@/types/report";

import styles from "./custom-report-export.module.css";

interface CustomReportExportProps {
  report: ResearchReport;
  triggerClassName: string;
}

export function CustomReportExport({
  report,
  triggerClassName,
}: CustomReportExportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [template, setTemplate] = useState(DEFAULT_REPORT_TEMPLATE);
  const [hasLoadedTemplate, setHasLoadedTemplate] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const preview = useMemo(
    () => renderReportTemplate(template, report),
    [report, template],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedTemplate = window.localStorage.getItem(
        REPORT_TEMPLATE_STORAGE_KEY,
      );
      if (storedTemplate) setTemplate(storedTemplate);
      setHasLoadedTemplate(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hasLoadedTemplate) return;
    window.localStorage.setItem(REPORT_TEMPLATE_STORAGE_KEY, template);
  }, [hasLoadedTemplate, template]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;

      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [isOpen]);

  function insertField(name: string) {
    const insertion = `{{ ${name} }}`;
    const textarea = templateRef.current;
    const selectionStart = textarea?.selectionStart ?? template.length;
    const selectionEnd = textarea?.selectionEnd ?? template.length;
    const nextTemplate =
      template.slice(0, selectionStart) +
      insertion +
      template.slice(selectionEnd);
    setTemplate(nextTemplate);
    setActionMessage(null);

    window.requestAnimationFrame(() => {
      templateRef.current?.focus();
      const nextCursor = selectionStart + insertion.length;
      templateRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function copyPreview() {
    if (preview.error) return;

    try {
      await navigator.clipboard.writeText(preview.output);
      setActionMessage("Copied to clipboard");
    } catch {
      setActionMessage("Copy was unavailable. Download the file instead.");
    }
  }

  function downloadPreview() {
    if (preview.error) return;
    downloadRenderedReport(report, preview.output);
    setActionMessage("Download started");
  }

  return (
    <>
      <button
        className={triggerClassName}
        onClick={() => {
          setActionMessage(null);
          setIsOpen(true);
        }}
        type="button"
      >
        <Icon name="file" />
        Custom export
      </button>

      {isOpen && (
        <div className={styles.layer}>
          <button
            aria-label="Close custom export"
            className={styles.backdrop}
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <aside
            aria-labelledby="custom-export-title"
            aria-modal="true"
            className={styles.drawer}
            ref={drawerRef}
            role="dialog"
          >
            <header className={styles.header}>
              <div>
                <span className={styles.eyebrow}>Report export</span>
                <h2 id="custom-export-title">Custom template</h2>
                <p>
                  Shape a reusable text or Markdown export for the open report.
                </p>
              </div>
              <button
                aria-label="Close custom export"
                className={styles.iconButton}
                onClick={() => setIsOpen(false)}
                ref={closeButtonRef}
                type="button"
              >
                <Icon name="close" />
              </button>
            </header>

            <div className={styles.content}>
              <section className={styles.editorPanel}>
                <div className={styles.panelHeading}>
                  <div>
                    <span>Template</span>
                    <small>Saved in this browser</small>
                  </div>
                  <button
                    className={styles.resetButton}
                    onClick={() => {
                      setTemplate(DEFAULT_REPORT_TEMPLATE);
                      setActionMessage("Default template restored");
                    }}
                    type="button"
                  >
                    Restore default
                  </button>
                </div>

                <label className={styles.srOnly} htmlFor="report-export-template">
                  Export template
                </label>
                <textarea
                  aria-describedby={
                    preview.error
                      ? "template-guidance template-error"
                      : "template-guidance"
                  }
                  aria-invalid={Boolean(preview.error)}
                  id="report-export-template"
                  onChange={(event) => {
                    setTemplate(event.target.value);
                    setActionMessage(null);
                  }}
                  ref={templateRef}
                  spellCheck={false}
                  value={template}
                />
                <p className={styles.guidance} id="template-guidance">
                  Wrap report values in double braces, such as{" "}
                  <code>{"{{ title }}"}</code> or{" "}
                  <code>{"{{ citationLabel }}"}</code>
                  .
                </p>
                {preview.error && (
                  <p className={styles.error} id="template-error" role="alert">
                    <Icon name="close" size={14} />
                    {preview.error}
                  </p>
                )}

                <div className={styles.values}>
                  <div className={styles.valuesHeading}>
                    <h3>Report values</h3>
                    <span>Select to insert</span>
                  </div>
                  <div className={styles.valueGrid}>
                    {REPORT_TEMPLATE_FIELDS.map((field) => (
                      <button
                        key={field.name}
                        onClick={() => insertField(field.name)}
                        type="button"
                      >
                        <code>{field.name}</code>
                        <span>{field.description}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </section>

              <section
                aria-labelledby="template-preview-title"
                className={styles.previewPanel}
              >
                <div className={styles.previewHeading}>
                  <div>
                    <span>Live preview</span>
                    <h3 id="template-preview-title">{report.title}</h3>
                  </div>
                  <span data-valid={!preview.error}>
                    {preview.error ? "Needs attention" : "Ready"}
                  </span>
                </div>
                <div className={styles.previewViewport}>
                  {preview.error ? (
                    <div className={styles.previewEmpty}>
                      <Icon name="file" size={24} />
                      <p>Resolve the template message to restore the preview.</p>
                    </div>
                  ) : (
                    <pre>{preview.output}</pre>
                  )}
                </div>
              </section>
            </div>

            <footer className={styles.footer}>
              <p aria-live="polite">{actionMessage}</p>
              <div>
                <button
                  className={styles.copyButton}
                  disabled={Boolean(preview.error)}
                  onClick={() => void copyPreview()}
                  type="button"
                >
                  <Icon name="file" size={16} />
                  Copy export
                </button>
                <button
                  className={styles.downloadButton}
                  disabled={Boolean(preview.error)}
                  onClick={downloadPreview}
                  type="button"
                >
                  <Icon name="download" size={16} />
                  Download .md
                </button>
              </div>
            </footer>
          </aside>
        </div>
      )}
    </>
  );
}
