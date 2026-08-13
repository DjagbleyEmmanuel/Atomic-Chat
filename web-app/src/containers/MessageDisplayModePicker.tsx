import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type MessageDisplayMode, useInterfaceSettings } from '@/hooks/useInterfaceSettings'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { Button } from '@/components/ui/button'
import { ChevronsUpDown } from 'lucide-react'

const MESSAGE_DISPLAY_MODES: ReadonlyArray<{
  value: MessageDisplayMode
  translationKey: string
}> = [
  { value: 'markdown', translationKey: 'settings:interface.messageDisplayMarkdown' },
  { value: 'plain', translationKey: 'settings:interface.messageDisplayPlain' },
  { value: 'monospace', translationKey: 'settings:interface.messageDisplayMonospace' },
]

export function MessageDisplayModePicker() {
  const { messageDisplayMode, setMessageDisplayMode } = useInterfaceSettings()
  const { t } = useTranslation()

  const current =
    MESSAGE_DISPLAY_MODES.find((o) => o.value === messageDisplayMode) ??
    MESSAGE_DISPLAY_MODES[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between"
        >
          {t(current.translationKey)}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {MESSAGE_DISPLAY_MODES.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className={cn(
              'cursor-pointer my-0.5',
              messageDisplayMode === option.value && 'bg-secondary-foreground/8'
            )}
            onClick={() => setMessageDisplayMode(option.value)}
          >
            {t(option.translationKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}