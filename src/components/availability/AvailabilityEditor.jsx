import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WEEKDAYS, validateAvailabilityRows } from '@/modules/availability/availabilityUtils';

export default function AvailabilityEditor({
  title,
  description,
  rows = [],
  isLoading = false,
  isSaving = false,
  isDisabled = false,
  idPrefix = 'availability',
  onSave,
}) {
  const [draft, setDraft] = useState([]);

  useEffect(() => {
    setDraft(rows.map((row) => ({
      weekday: Number(row.weekday),
      start_time: row.start_time?.slice(0, 5) || '09:00',
      end_time: row.end_time?.slice(0, 5) || '10:00',
    })));
  }, [rows]);

  const updateSlot = (index, key, value) => {
    setDraft((current) => current.map((slot, slotIndex) => (
      slotIndex === index ? { ...slot, [key]: value } : slot
    )));
  };

  const addSlot = (weekday) => {
    setDraft((current) => [...current, { weekday, start_time: '09:00', end_time: '10:00' }]);
  };

  const removeSlot = (index) => {
    setDraft((current) => current.filter((_, slotIndex) => slotIndex !== index));
  };

  const save = () => {
    const error = validateAvailabilityRows(draft);
    if (error) {
      toast.error(error);
      return;
    }
    onSave(draft);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando horários...</p>
        ) : WEEKDAYS.map((day) => {
          const daySlots = draft
            .map((slot, index) => ({ ...slot, index }))
            .filter((slot) => slot.weekday === day.value);

          return (
            <section key={day.value} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium">{day.label}</h3>
                <Button type="button" size="sm" variant="outline" disabled={isDisabled || isSaving} onClick={() => addSlot(day.value)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar horário
                </Button>
              </div>
              {daySlots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem disponibilidade neste dia.</p>
              ) : (
                <div className="space-y-2">
                  {daySlots.map((slot) => (
                    <div key={`${day.value}-${slot.index}`} className="flex items-end gap-2">
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor={`${idPrefix}-start-${day.value}-${slot.index}`} className="sr-only">
                          Início, {day.label.toLowerCase()}
                        </Label>
                        <Input
                          id={`${idPrefix}-start-${day.value}-${slot.index}`}
                          type="time"
                          value={slot.start_time}
                          disabled={isDisabled || isSaving}
                          onChange={(event) => updateSlot(slot.index, 'start_time', event.target.value)}
                        />
                      </div>
                      <span className="pb-2 text-sm text-muted-foreground">até</span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Label htmlFor={`${idPrefix}-end-${day.value}-${slot.index}`} className="sr-only">
                          Término, {day.label.toLowerCase()}
                        </Label>
                        <Input
                          id={`${idPrefix}-end-${day.value}-${slot.index}`}
                          type="time"
                          value={slot.end_time}
                          disabled={isDisabled || isSaving}
                          onChange={(event) => updateSlot(slot.index, 'end_time', event.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Remover horário de ${day.label.toLowerCase()}`}
                        disabled={isDisabled || isSaving}
                        onClick={() => removeSlot(slot.index)}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
        <div className="flex justify-end">
          <Button type="button" disabled={isLoading || isSaving || isDisabled} onClick={save}>
            {isSaving ? 'Salvando...' : 'Salvar horários'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
