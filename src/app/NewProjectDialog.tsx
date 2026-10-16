import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { useStrings } from './i18n'

interface NewProjectDialogProps {
  defaultName: string
  initialCwd: string
  onCancel: () => void
  onPickDirectory: () => Promise<string | null>
  onConfirm: (name: string, cwd: string) => void
}

/** 项目是一条记录。名字自己起，主目录另选，两者不必相同。 */
export default function NewProjectDialog({
  defaultName,
  initialCwd,
  onCancel,
  onPickDirectory,
  onConfirm
}: NewProjectDialogProps) {
  const strings = useStrings()
  const [name, setName] = useState(defaultName)
  const [cwd, setCwd] = useState(initialCwd)
  const [picking, setPicking] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const pick = (): void => {
    if (picking) return
    setPicking(true)
    void onPickDirectory().then((picked) => {
      if (picked) setCwd(picked)
      setPicking(false)
    })
  }

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed || !cwd.trim()) return
    onConfirm(trimmed, cwd.trim())
  }

  return (
    <>
      <motion.button
        type="button"
        aria-label={strings.common.cancel}
        className="absolute inset-0 z-[80] bg-backdrop-strong backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        onClick={onCancel}
      />
      <motion.div
        className="pointer-events-none absolute inset-0 z-[90] flex items-center justify-center p-5"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.14 }}
      >
        <motion.div
          data-testid="new-project-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-project-title"
          className="pointer-events-auto w-full max-w-[420px] rounded-2xl border border-border-default bg-surface p-4 shadow-2xl"
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ type: 'spring', stiffness: 480, damping: 34, mass: 0.8 }}
        >
          <h2
            id="new-project-title"
            className="font-pingfang text-[14px] font-semibold text-text-primary"
          >
            {strings.navigation.projectNameTitle}
          </h2>
          <p className="mt-1 font-pingfang text-[12px] leading-5 text-text-faint">
            {strings.navigation.projectNameHint}
          </p>
          <input
            autoFocus
            data-testid="new-project-name"
            value={name}
            placeholder={strings.navigation.projectNameTitle}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && cwd.trim()) submit()
            }}
            className="mt-3 w-full rounded-lg border border-border-default bg-content px-2 py-1.5 font-pingfang text-[12px] text-text-primary outline-none"
          />
          <div className="mt-3 flex items-center gap-2">
            <p
              data-testid="new-project-cwd"
              className="min-w-0 flex-1 truncate font-pingfang text-[12px] text-text-muted"
            >
              {cwd || strings.navigation.projectDirectoryEmpty}
            </p>
            <button
              type="button"
              data-testid="new-project-pick"
              className="shrink-0 rounded-lg border border-border-default px-2 py-1 font-pingfang text-[12px] text-text-secondary"
              onClick={pick}
            >
              {strings.navigation.projectPickDirectory}
            </button>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              data-testid="new-project-cancel"
              className="rounded-lg px-3 py-1.5 font-pingfang text-[12px] font-medium text-text-muted transition-colors hover:bg-surface-strong hover:text-text-secondary"
              onClick={onCancel}
            >
              {strings.common.cancel}
            </button>
            <button
              type="button"
              data-testid="new-project-confirm"
              disabled={!name.trim() || !cwd.trim()}
              className="rounded-lg bg-button-primary px-3 py-1.5 font-pingfang text-[12px] font-medium text-button-primary-fg disabled:opacity-40"
              onClick={submit}
            >
              {strings.common.confirm}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </>
  )
}
