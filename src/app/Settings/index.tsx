import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useTheme } from '@/components/theme-provider'

export default function Settings() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose between light and dark mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Label htmlFor="dark-mode">Light</Label>
            <Switch
              id="dark-mode"
              checked={theme === 'dark'}
              onCheckedChange={checked => setTheme(checked ? 'dark' : 'light')}
            />
            <Label htmlFor="dark-mode">Dark</Label>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
