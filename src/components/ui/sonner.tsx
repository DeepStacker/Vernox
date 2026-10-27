import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";
import { Info, CheckCircle2, AlertTriangle, AlertCircle, Loader2 } from "lucide-react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      closeButton
      richColors={false}
      duration={4500}
      icons={{
        info: (
          <div className="w-6 h-6 rounded-full bg-[#B8860B]/15 border border-[#B8860B]/35 flex items-center justify-center shrink-0 text-[#B8860B] shadow-2xs">
            <Info className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
        ),
        success: (
          <div className="w-6 h-6 rounded-full bg-[#107C41]/15 border border-[#107C41]/35 flex items-center justify-center shrink-0 text-[#107C41] shadow-2xs">
            <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
        ),
        error: (
          <div className="w-6 h-6 rounded-full bg-[#8B1E1E]/15 border border-[#8B1E1E]/35 flex items-center justify-center shrink-0 text-[#8B1E1E] shadow-2xs">
            <AlertCircle className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
        ),
        warning: (
          <div className="w-6 h-6 rounded-full bg-[#D97706]/15 border border-[#D97706]/35 flex items-center justify-center shrink-0 text-[#D97706] shadow-2xs">
            <AlertTriangle className="w-3.5 h-3.5 stroke-[2.2]" />
          </div>
        ),
        loading: (
          <div className="w-6 h-6 rounded-full bg-[#2C221E]/10 border border-[#2C221E]/20 flex items-center justify-center shrink-0 text-[#2C221E] dark:text-[#FAF8F5]">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          </div>
        ),
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast font-sans text-xs sm:text-sm rounded-lg border backdrop-blur-md shadow-2xl p-4 transition-all duration-300 flex items-start gap-3",
          info:
            "!bg-[#FAF8F5] dark:!bg-[#1C1614] !text-[#2C221E] dark:!text-[#FAF8F5] !border-[#E0D5C3] dark:!border-[#3E2F29] !border-l-4 !border-l-[#B8860B] shadow-[-4px_8px_32px_rgba(35,25,22,0.18)]",
          success:
            "!bg-[#FAF8F5] dark:!bg-[#1C1614] !text-[#2C221E] dark:!text-[#FAF8F5] !border-[#E0D5C3] dark:!border-[#3E2F29] !border-l-4 !border-l-[#1E7E34] shadow-[-4px_8px_32px_rgba(35,25,22,0.18)]",
          error:
            "!bg-[#FAF8F5] dark:!bg-[#1C1614] !text-[#2C221E] dark:!text-[#FAF8F5] !border-[#E0D5C3] dark:!border-[#3E2F29] !border-l-4 !border-l-[#991B1B] shadow-[-4px_8px_32px_rgba(35,25,22,0.18)]",
          warning:
            "!bg-[#FAF8F5] dark:!bg-[#1C1614] !text-[#2C221E] dark:!text-[#FAF8F5] !border-[#E0D5C3] dark:!border-[#3E2F29] !border-l-4 !border-l-[#D97706] shadow-[-4px_8px_32px_rgba(35,25,22,0.18)]",
          title:
            "font-semibold text-[#2C221E] dark:text-[#FAF8F5] tracking-tight text-xs sm:text-[13px] leading-snug",
          description:
            "text-[#7A6A65] dark:text-[#B0A29A] text-[11px] leading-relaxed mt-0.5",
          actionButton:
            "bg-[#2C221E] text-[#FAF8F5] hover:bg-black font-semibold text-xs px-3 py-1.5 rounded transition",
          cancelButton:
            "bg-[#EAE3D6] text-[#2C221E] hover:bg-[#DDD4C4] text-xs px-3 py-1.5 rounded transition",
          closeButton:
            "!border !border-[#D9CEBF] dark:!border-[#3D302A] !bg-[#FAF8F5] dark:!bg-[#1A1412] !text-[#7A6A65] hover:!text-[#2C221E] transition",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
