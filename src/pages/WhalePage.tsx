import { WhaleTracker } from "@/components/dashboard/WhaleTracker";

export default function WhalePage() {
  return (
    <div style={{ maxWidth: 700, margin: "0 auto" }}>
      <div className="panel">
        <div className="panel-head"><h2>🐋 Whale Alert Feed</h2></div>
        <div className="panel-body">
          <WhaleTracker />
        </div>
      </div>
    </div>
  );
}
