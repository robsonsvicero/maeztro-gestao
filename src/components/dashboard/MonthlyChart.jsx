import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";
import { format, startOfMonth, addDays } from "date-fns";
import { useTheme } from "@/lib/ThemeContext";

export default function MonthlyChart({ transactions }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const generateChartData = () => {
    const days = [];
    const start = startOfMonth(new Date());

    for (let i = 0; i < 30; i++) {
      const day = addDays(start, i);
      const dayTransactions = transactions.filter(t => 
        format(new Date(t.date), 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
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
      isDark ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'
    }`}>
      <CardHeader className={`border-b ${isDark ? 'border-slate-600' : 'border-slate-200'}`}>
        <CardTitle className={`flex items-center gap-2 ${
          isDark ? 'text-slate-100' : 'text-slate-900'
        }`}>
          <TrendingUp className="w-5 h-5 text-[#094C7E]" />
          Fluxo de Caixa Mensal
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#64748b' : '#cbd5e1'} />
            <XAxis 
              dataKey="day" 
              stroke={isDark ? '#cbd5e1' : '#475569'}
              style={{ fontSize: '12px' }}
            />
            <YAxis 
              stroke={isDark ? '#cbd5e1' : '#475569'}
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => `R$ ${value}`}
            />
            <Tooltip 
              contentStyle={{
                backgroundColor: isDark ? '#0f172a' : '#ffffff',
                border: isDark ? '1px solid #64748b' : '1px solid #cbd5e1',
                borderRadius: '8px',
                backdropFilter: 'blur(10px)',
                color: isDark ? '#f8fafc' : '#0f172a'
              }}
              formatter={(value) => `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            />
            <Legend wrapperStyle={{ color: isDark ? '#f8fafc' : '#334155' }} />
            <Bar dataKey="Receitas" fill="#10b981" radius={[8, 8, 0, 0]} />
            <Bar dataKey="Despesas" fill="#ef4444" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}