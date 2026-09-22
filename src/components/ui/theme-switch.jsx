import { Moon, Sun } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/lib/ThemeContext';

export function ThemeSwitch({ className = '' }) {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === 'light';

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Moon className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      <Switch
        checked={isLight}
        onCheckedChange={toggleTheme}
        aria-label={isLight ? 'Tema claro ativado. Alternar para tema escuro' : 'Tema escuro ativado. Alternar para tema claro'}
        title={isLight ? 'Alternar para tema escuro' : 'Alternar para tema claro'}
        className="data-[state=checked]:bg-[#094C7E]"
      />
      <Sun className="h-4 w-4 text-amber-500 dark:text-amber-300" aria-hidden="true" />
    </div>
  );
}