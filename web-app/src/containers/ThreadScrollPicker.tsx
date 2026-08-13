import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  threadScrollBehaviorOptions,
  type ThreadScrollBehavior,
} from '@/constants/threadScroll'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n/react-i18next-compat'
import { Button } from '@/components/ui/button'
import { ChevronsUpDown } from 'lucide-react'
import { useInterfaceSettings } from '@/hooks/useInterfaceSettings'

export function ThreadScrollPicker() {
  const { threadScroll, setThreadScroll } = useInterfaceSettings()
  const { t } = useTranslation()

  const current =
    threadScrollBehaviorOptions.find((o) => o.value === threadScroll) ??
    threadScrollBehaviorOptions[0]

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
        {threadScrollBehaviorOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            className={cn(
              'cursor-pointer my-0.5',
              threadScroll === option.value && 'bg-secondary-foreground/8'
            )}
            onClick={() => setThreadScroll(option.value as ThreadScrollBehavior)}
          >
            {t(option.translationKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}