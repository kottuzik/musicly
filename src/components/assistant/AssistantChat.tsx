"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextareaField } from "@/components/ui/TextareaField";
import styles from "./Assistant.module.css";

type Slot = { date: string; weekday: string; start: string; end: string; teacher: string; student: string; subject: string };
type Turn = { role: "user" | "assistant"; content: string; slots?: Slot[] };

const SUGGESTIONS = [
  "אילו מורים לפסנתר פנויים ביום רביעי?",
  "מצא מועד חלופי לשיעור שבוטל",
  "כמה שיעורים התקיימו החודש?",
  "נסח הודעה לתלמיד על שינוי שעה",
];

function formatDate(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function AssistantChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: "user", content }];
    setTurns(next);
    setQuestion("");
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Only the text is sent back; the server keeps no conversation.
        body: JSON.stringify({ messages: next.slice(-10).map(({ role, content: c }) => ({ role, content: c })) }),
      });
      const data = (await response.json().catch(() => null)) as { answer?: string; slots?: Slot[]; message?: string } | null;
      if (!response.ok || !data?.answer) {
        setError(data?.message ?? "העוזר אינו זמין כרגע. נסו שוב בעוד כמה דקות.");
      } else {
        setTurns([...next, { role: "assistant", content: data.answer, slots: data.slots }]);
      }
    } catch {
      setError("אין חיבור לשרת. בדקו את החיבור ונסו שוב.");
    } finally {
      setBusy(false);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    }
  }

  return (
    <div className={styles.chat}>
      <div className={styles.scroll}>
      {turns.length === 0 ? (
        <>
          <p className="text-body-lg">שלום! במה אפשר לעזור? למשל:</p>
          <ul className={styles.suggestions} aria-label="הצעות לשאלות">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <Button variant="secondary" size="small" onClick={() => void ask(s)} disabled={busy}>
                  {s}
                </Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <ol className={styles.log} aria-live="polite" aria-label="השיחה">
          {turns.map((t, i) => (
            <li key={i} className={`${styles.message} ${t.role === "user" ? styles.user : styles.assistant}`}>
              <span className="visually-hidden">{t.role === "user" ? "אתם: " : "העוזר: "}</span>
              {t.content}
              {t.slots && t.slots.length > 0 && (
                <div className={styles.slots}>
                  <strong>מועדים אפשריים</strong>
                  <div className={styles.slotsWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">תאריך</th>
                          <th scope="col">שעה</th>
                          <th scope="col">מורה</th>
                          <th scope="col">תלמיד</th>
                          <th scope="col">תחום</th>
                          <th scope="col">
                            <span className="visually-hidden">פעולה</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.slots.map((s) => (
                          <tr key={`${s.date}${s.start}${s.teacher}`}>
                            <td>
                              {s.weekday}, {formatDate(s.date)}
                            </td>
                            <td>
                              <bdi dir="ltr">
                                {s.start}–{s.end}
                              </bdi>
                            </td>
                            <td>{s.teacher}</td>
                            <td>{s.student}</td>
                            <td>{s.subject}</td>
                            <td>
                              <Link href={`/admin/calendar?view=day&date=${s.date}`}>פתיחה בלוח השנה</Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-small text-secondary">השיבוץ עצמו נעשה רק בחלון „שיעור חדש” בלוח השנה.</p>
                </div>
              )}
            </li>
          ))}
          {busy && (
            <li className={`${styles.message} ${styles.assistant}`} role="status">
              העוזר חושב...
            </li>
          )}
        </ol>
      )}

      {error && <Alert tone="error">{error}</Alert>}
      <div ref={endRef} />
      </div>

      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <TextareaField
          label="שאל שאלה..."
          maxLength={1000}
          rows={2}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
        />
        <div className={styles.formRow}>
          <Button type="submit" loading={busy} disabled={!question.trim()}>
            שליחה
          </Button>
          {turns.length > 0 && (
            <Button variant="outline" onClick={() => { setTurns([]); setError(null); }} disabled={busy}>
              שיחה חדשה
            </Button>
          )}
        </div>
        <p className={`${styles.hint} text-small text-secondary`}>
          השאלות נשלחות לשירות AI חיצוני, עם שמות ותאריכים בלבד — בלי טלפונים, אימיילים או הערות. השיחה אינה נשמרת.
        </p>
      </form>
    </div>
  );
}
