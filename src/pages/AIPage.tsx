import { AIAnalysisPanel } from "@/components/ai/AIAnalysisPanel";
import { AIChatPanel } from "@/components/ai/AIChatPanel";

export default function AIPage() {
  return (
    <div style={{ padding: "0 2px" }}>
      <AIChatPanel />
      <div style={{ marginTop: 16 }}>
      <AIAnalysisPanel />
      </div>
    </div>
  );
}