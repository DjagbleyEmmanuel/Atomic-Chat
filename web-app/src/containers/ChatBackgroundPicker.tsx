import { useRef } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  CHAT_BACKGROUNDS,
  useInterfaceSettings,
} from '@/hooks/useInterfaceSettings'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ChevronsUpDown, ImagePlus, Trash2 } from 'lucide-react'
import { useTranslation } from '@/i18n/react-i18next-compat'
import type { ChatBackground } from '@/hooks/useInterfaceSettings'
import { toast } from 'sonner'

const MAX_WALLPAPER_BYTES = 1.5 * 1024 * 1024

export function ChatBackgroundPicker() {
  const { chatBackground, chatWallpaper, setChatBackground, setChatWallpaper } =
    useInterfaceSettings()
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const current =
    CHAT_BACKGROUNDS.find((b) => b.value === chatBackground) ??
    CHAT_BACKGROUNDS[0]

  const handleFile = (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings:interface.invalidWallpaperType'))
      return
    }
    if (file.size > MAX_WALLPAPER_BYTES) {
      toast.error(t('settings:interface.wallpaperTooLarge'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setChatWallpaper(reader.result)
      }
    }
    reader.onerror = () => {
      toast.error(t('settings:interface.wallpaperReadError'))
    }
    reader.readAsDataURL(file)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-between"
          title={t('settings:interface.chatBackground')}
        >
          <span className="flex items-center gap-2">
            <span
              className="size-4 rounded-full border border-border"
              style={
                chatWallpaper
                  ? {
                      backgroundImage: `url("${chatWallpaper}")`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : current.css
                    ? { backgroundImage: current.css }
                    : { backgroundColor: 'var(--background)' }
              }
            />
            {chatWallpaper
              ? t('settings:interface.customWallpaper')
              : current.label}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {t('settings:interface.presetBackgrounds')}
        </DropdownMenuLabel>
        {CHAT_BACKGROUNDS.map((item) => (
          <DropdownMenuItem
            key={item.value}
            className={cn(
              'cursor-pointer my-0.5',
              chatBackground === item.value &&
                !chatWallpaper &&
                'bg-secondary-foreground/8'
            )}
            onClick={() => {
              setChatBackground(item.value as ChatBackground)
              setChatWallpaper(null)
            }}
          >
            <span className="flex items-center gap-2">
              <span
                className="size-4 rounded-full border border-border shrink-0"
                style={
                  item.css
                    ? { backgroundImage: item.css }
                    : { backgroundColor: 'var(--background)' }
                }
              />
              {item.label}
            </span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer my-0.5"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="flex items-center gap-2">
            <ImagePlus className="size-4 text-muted-foreground" />
            {t('settings:interface.uploadWallpaper')}
          </span>
        </DropdownMenuItem>
        {chatWallpaper && (
          <DropdownMenuItem
            className="cursor-pointer my-0.5"
            onClick={() => setChatWallpaper(null)}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="size-4 text-muted-foreground" />
              {t('settings:interface.removeWallpaper')}
            </span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
    </DropdownMenu>
  )
}
