import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import { format, startOfMonth, addDays } from "date-fns";
import { useTheme } from "@/lib/ThemeContext";
import { parseLocalDate } from "@/utils/dateUtils";

export default function MonthlyChart({ transactions }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const generateChartData = () => {
    const days = [];
    const start = startOfMonth(new Date());

    for (let i = 0; i < 30; i++) {
      const day = addDays(start, i);
      const dayTransactions = transactions.filter(t => 
        format(parseLocalDate(t.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
      );

      days.push({
        day: format(day, 'd'),
        Receitas: dayTransactions
          .filter(t => t.type === 'income')
          .reduce((sum, t) => sum + t.amount, 0),
        Despesas: dayTransactions
          .filter(t => t.type === 'expense')
          .reduce((sum, t) => sum + t.amount, 0),
      });
    }

    return days;
  };

  const data = generateChartData();

  return (
    <Card className={`shadow-xl ${
      isDark ? 'bg-[#142b42] border-[#31516e]' : 'bg-white border-slate-200'
    }`}>
      <CardHeader className={`border-b ${isDark ? 'border-[#31516e]' : 'border-slate-200'}`}>
        <CardTitle className={`flex items-center gap-2 ${
          isDark ? 'text-sky-50' : 'text-slate-900'
        }`}>
          <TrendingUp className={`w-5 h-5 ${isDark ? 'text-sky-300' : 'text-[#094C7E]'}`} />
          Fluxo de Caixa Mensal
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#31516e' : '#cbd5e1'} />
            <XAxis 
              dataKey="day" 
              stroke={isDark ? '#bfdbfe' : '#475569'}
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke={isDark ? '#bfdbfe' : '#475569'}
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `R$ ${value}`}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: isDark ? '#0b1726' : '#ffffff',
                border: isDark ? '1px solid #31516e' : '1px solid #cbd5e1',
                borderRadius: '8px',
                backdropFilter: 'blur(10px)',
                color: isDark ? '#f0f9ff' : '#0f172a'
              }}
              formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            />
            <Legend wrapperStyle={{ color: isDark ? '#e0f2fe' : '#334155' }} />
            <Bar dataKey="Receitas" fill={isDark ? '#34d399' : '#10b981'} radius={[8, 8, 0, 0]} />
            <Bar dataKey="Despesas" fill={isDark ? '#fb7185' : '#ef4444'} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}