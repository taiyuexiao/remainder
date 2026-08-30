export default function PlaceholderPage({
  title,
  icon,
  hint,
}: {
  title: string;
  icon: string;
  hint: string;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h2 className="text-xl font-semibold text-slate-700">{title}</h2>
        <p className="mt-2 text-sm text-slate-400">{hint ? `待开发：${hint}` : '建设中'}</p>
      </div>
    </div>
  );
}
