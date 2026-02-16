import { useEffect, useRef, useState } from "react"
import { Mic, Plus } from "lucide-react"
import { Logo } from "@/components/icons/Logo"
import { cn } from "@/lib/utils"

const LANDING_HEADING = "Harry, welcome to your second brain."
const LANDING_HEADING_PAUSE_AT = "Harry,"
const LANDING_PAUSE_MS = 500
const LANDING_TYPEWRITER_INTERVAL_MS = 45
const LANDING_TYPEWRITER_CHUNK = 1
const PIN_PROMPT = "Please enter your brain pin:"
const BRAIN_PIN = "5271"
const PIN_LENGTH = 4
const DELETE_INTERVAL_MS = 35
type HeadingPhase = "pin" | "deleting" | "welcome"

type LandingViewProps = {
  inputValue: string
  onInputChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
}

export function LandingView({
  inputValue,
  onInputChange,
  onSend,
  disabled = false,
}: LandingViewProps) {
  const [pinUnlocked, setPinUnlocked] = useState(false)
  const [pinValue, setPinValue] = useState("")
  const [pinShake, setPinShake] = useState(false)
  const [pinLiveMessage, setPinLiveMessage] = useState("")
  const [headingPhase, setHeadingPhase] = useState<HeadingPhase>("pin")
  const [displayedHeading, setDisplayedHeading] = useState("")
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* PIN prompt typewriter on load */
  useEffect(() => {
    if (headingPhase !== "pin") return
    let index = 0
    intervalRef.current = setInterval(() => {
      index += LANDING_TYPEWRITER_CHUNK
      if (index >= PIN_PROMPT.length) {
        setDisplayedHeading(PIN_PROMPT)
        if (intervalRef.current) clearInterval(intervalRef.current)
        intervalRef.current = null
        return
      }
      setDisplayedHeading(PIN_PROMPT.slice(0, index))
    }, LANDING_TYPEWRITER_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [headingPhase])

  /* Delete PIN prompt after correct PIN */
  useEffect(() => {
    if (headingPhase !== "deleting") return
    intervalRef.current = setInterval(() => {
      setDisplayedHeading((prev) => {
        if (prev.length <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          intervalRef.current = null
          setTimeout(() => setHeadingPhase("welcome"), 0)
          return ""
        }
        return prev.slice(0, -1)
      })
    }, DELETE_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [headingPhase])

  /* Welcome typewriter (after delete) */
  useEffect(() => {
    if (headingPhase !== "welcome") return
    let index = 0
    const runFirstPart = () => {
      intervalRef.current = setInterval(() => {
        index += LANDING_TYPEWRITER_CHUNK
        if (index >= LANDING_HEADING_PAUSE_AT.length) {
          setDisplayedHeading(LANDING_HEADING_PAUSE_AT)
          if (intervalRef.current) clearInterval(intervalRef.current)
          intervalRef.current = null
          timeoutRef.current = setTimeout(runSecondPart, LANDING_PAUSE_MS)
          return
        }
        setDisplayedHeading(LANDING_HEADING.slice(0, index))
      }, LANDING_TYPEWRITER_INTERVAL_MS)
    }
    const runSecondPart = () => {
      index = LANDING_HEADING_PAUSE_AT.length
      intervalRef.current = setInterval(() => {
        index += LANDING_TYPEWRITER_CHUNK
        if (index >= LANDING_HEADING.length) {
          setDisplayedHeading(LANDING_HEADING)
          if (intervalRef.current) clearInterval(intervalRef.current)
          intervalRef.current = null
          return
        }
        setDisplayedHeading(LANDING_HEADING.slice(0, index))
      }, LANDING_TYPEWRITER_INTERVAL_MS)
    }
    runFirstPart()
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [headingPhase])

  const handlePinDigit = (digit: string) => {
    if (pinValue.length >= PIN_LENGTH) return
    const next = pinValue + digit
    setPinValue(next)
    if (next.length === PIN_LENGTH) {
      if (next === BRAIN_PIN) {
        setPinUnlocked(true)
        setPinValue("")
        setHeadingPhase("deleting")
      } else {
        setPinShake(true)
        setPinValue("")
        setPinLiveMessage("Wrong PIN")
        setTimeout(() => {
          setPinShake(false)
          setPinLiveMessage("")
        }, 500)
      }
    }
  }

  /* Keyboard PIN entry (0-9) when gate is showing */
  useEffect(() => {
    if (pinUnlocked) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault()
        const digit = e.key
        setPinValue((prev) => {
          if (prev.length >= PIN_LENGTH) return prev
          const next = prev + digit
          if (next.length === PIN_LENGTH) {
            if (next === BRAIN_PIN) {
              setPinUnlocked(true)
              setHeadingPhase("deleting")
              return ""
            }
            setPinShake(true)
            setPinLiveMessage("Wrong PIN")
            setTimeout(() => {
              setPinShake(false)
              setPinLiveMessage("")
            }, 500)
            return ""
          }
          return next
        })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [pinUnlocked])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim() || disabled) return
    onSend()
  }

  return (
    <div className="flex min-h-screen flex-col bg-brain-canvas">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 pb-6 pt-[calc(1rem+env(safe-area-inset-top,0px))] sm:px-4 sm:pb-8">
        <div className="w-full max-w-2xl space-y-6 sm:space-y-8">
          {/* Greeting with logo */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-3">
              <Logo size={39} />
              <h2 className="min-w-0 font-spotify text-xl font-semibold text-brain-primary-dark sm:text-2xl md:text-3xl">
                {displayedHeading}
                {(headingPhase === "pin" && displayedHeading.length < PIN_PROMPT.length) ||
                headingPhase === "deleting" ||
                (headingPhase === "welcome" && displayedHeading.length < LANDING_HEADING.length) ? (
                  <span className="animate-pulse" aria-hidden>|</span>
                ) : null}
              </h2>
            </div>
          </div>

          <div className="relative min-h-[320px]">
            {/* PIN keypad – animates out when unlocked */}
            <div
              className={cn(
                "flex flex-col items-center gap-8 transition-all duration-300",
                pinUnlocked && "pointer-events-none absolute inset-0 opacity-0"
              )}
              aria-hidden={pinUnlocked}
            >
              <div
                className={cn(pinShake && "animate-pin-shake", "flex flex-col items-center gap-8")}
              >
                <div
                  aria-live="polite"
                  aria-atomic
                  className="sr-only"
                  role="status"
                >
                  {pinLiveMessage}
                </div>
                <div className="flex justify-center gap-3" aria-hidden>
                  {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-3 w-3 rounded-full border-2 transition-colors",
                        i < pinValue.length
                          ? "border-brain-accent bg-brain-accent"
                          : "border-brain-muted/40 bg-transparent"
                      )}
                    />
                  ))}
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handlePinDigit(String(n))}
                        className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-full border-2 border-brain-muted/30 bg-brain-white text-xl font-medium text-brain-primary-dark shadow-sm transition-colors hover:bg-brain-cream hover:border-brain-muted/50 active:bg-brain-cream"
                        aria-label={`Number ${n}`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePinDigit("0")}
                    className="flex min-h-[56px] min-w-[56px] items-center justify-center rounded-full border-2 border-brain-muted/30 bg-brain-white text-xl font-medium text-brain-primary-dark shadow-sm transition-colors hover:bg-brain-cream hover:border-brain-muted/50 active:bg-brain-cream"
                    aria-label="0"
                  >
                    0
                  </button>
                </div>
              </div>
            </div>

            {/* Main input – animates in after unlock */}
            <div
              className={cn(
                "transition-all duration-300",
                !pinUnlocked && "pointer-events-none absolute inset-0 opacity-0"
              )}
              aria-hidden={!pinUnlocked}
            >
              <form onSubmit={handleSubmit}>
                <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-brain-muted/30 bg-brain-white px-3 py-3 shadow-sm focus-within:ring-2 focus-within:ring-brain-accent focus-within:ring-offset-2 sm:px-4">
                  <button
                    type="button"
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-brain-muted hover:bg-brain-cream hover:text-brain-primary-dark"
                    aria-label="Attach or add"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => onInputChange(e.target.value)}
                    placeholder="Ask anything about yourself."
                    disabled={disabled}
                    className="min-h-[44px] min-w-0 flex-1 bg-transparent text-base text-brain-primary-dark placeholder:text-brain-muted focus:outline-none sm:text-sm"
                  />
                  <div className="hidden shrink-0 items-center gap-1 sm:flex">
                    <select
                      aria-label="Model"
                      className="cursor-pointer rounded-lg border-0 bg-transparent py-2 pr-6 text-sm text-brain-muted focus:outline-none focus:ring-0"
                      defaultValue="default"
                    >
                      <option value="default">Default</option>
                    </select>
                    <button
                      type="button"
                      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-brain-muted hover:bg-brain-cream hover:text-brain-primary-dark"
                      aria-label="Voice input"
                    >
                      <Mic className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
