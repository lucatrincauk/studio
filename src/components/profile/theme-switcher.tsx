
'use client';

import { useTheme } from '@/contexts/theme-context';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Palette } from 'lucide-react';

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="mt-8 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Scegli Tema Applicazione
        </CardTitle>
        <CardDescription>
          Seleziona il tuo tema preferito per l'interfaccia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as 'light' | 'dark' | 'violet-dream' | 'energetic-coral' | 'forest-mist')}
          className="space-y-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="light" id="theme-light" />
            <Label htmlFor="theme-light" className="cursor-pointer">Chiaro</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dark" id="theme-dark" />
            <Label htmlFor="theme-dark" className="cursor-pointer">Scuro</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="violet-dream" id="theme-violet-dream" />
            <Label htmlFor="theme-violet-dream" className="cursor-pointer">Sogno Viola</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="energetic-coral" id="theme-energetic-coral" />
            <Label htmlFor="theme-energetic-coral" className="cursor-pointer">Corallo Energetico</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="forest-mist" id="theme-forest-mist" />
            <Label htmlFor="theme-forest-mist" className="cursor-pointer">Nebbia Forestale</Label>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
