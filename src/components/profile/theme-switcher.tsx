
'use client';

import { useTheme } from '@/contexts/theme-context';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette, Settings2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

export function ThemeSwitcher() {
  const { theme, setTheme, autoThemeEnabled, setAutoThemeEnabled } = useTheme();

  const handleAutoThemeToggle = (enabled: boolean) => {
    setAutoThemeEnabled(enabled);
  };

  const handleThemeSelection = (newTheme: Theme) => {
    setTheme(newTheme as Theme); 
  };

  return (
    <Card className="mt-8 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Aspetto Applicazione
        </CardTitle>
        <CardDescription>
          Personalizza l&apos;aspetto di Morchiometro.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between space-x-2 p-2 border rounded-lg">
          <Label htmlFor="auto-theme-switch" className="flex flex-col space-y-1">
            <span className="font-medium">Tema Automatico del Sistema</span>
            <span className="text-xs text-muted-foreground">
              Passa automaticamente tra tema chiaro e scuro in base alle tue impostazioni di sistema.
            </span>
          </Label>
          <Switch
            id="auto-theme-switch"
            checked={autoThemeEnabled}
            onCheckedChange={handleAutoThemeToggle}
            aria-label="Attiva tema automatico del sistema"
          />
        </div>

        <Separator />

        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">
            {autoThemeEnabled ? "Il tema manuale è disabilitato. Disattiva il tema automatico per scegliere manualmente." : "Scegli un Tema Manuale:"}
          </p>
          <RadioGroup
            value={autoThemeEnabled ? '' : theme} 
            onValueChange={(value) => handleThemeSelection(value as Theme)}
            className="space-y-2"
            disabled={autoThemeEnabled}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="forest-mist" id="theme-forest-mist" />
              <Label htmlFor="theme-forest-mist" className={`cursor-pointer ${autoThemeEnabled ? 'text-muted-foreground' : ''}`}>Nebbia Forestale</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="forest-mist-dark" id="theme-forest-mist-dark" />
              <Label htmlFor="theme-forest-mist-dark" className={`cursor-pointer ${autoThemeEnabled ? 'text-muted-foreground' : ''}`}>Nebbia Forestale (Scuro)</Label>
            </div>
             <div className="flex items-center space-x-2">
              <RadioGroupItem value="violet-dream" id="theme-violet-dream" />
              <Label htmlFor="theme-violet-dream" className={`cursor-pointer ${autoThemeEnabled ? 'text-muted-foreground' : ''}`}>Sogno Viola</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="energetic-coral" id="theme-energetic-coral" />
              <Label htmlFor="theme-energetic-coral" className={`cursor-pointer ${autoThemeEnabled ? 'text-muted-foreground' : ''}`}>Corallo Energetico</Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  );
}
