import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration</p>
      </div>

      <Card className="border-border/50 bg-card/80">
        <CardHeader><CardTitle className="text-sm font-medium">LLM Configuration</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Model</Label>
            <Input placeholder="gpt-4-turbo" className="bg-secondary/50 border-border/50" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Context Window</Label>
            <Input type="number" placeholder="32000" className="bg-secondary/50 border-border/50" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">RAG Enhancement</p>
              <p className="text-xs text-muted-foreground">Enable retrieval-augmented generation for hallucination control</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">Auto-Attribution</p>
              <p className="text-xs text-muted-foreground">Automatically run attribution reasoning on new intelligence</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card/80">
        <CardHeader><CardTitle className="text-sm font-medium">Data Sources</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">MITRE ATT&CK API Endpoint</Label>
            <Input placeholder="https://attack.mitre.org/api/" className="bg-secondary/50 border-border/50" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Sync Interval (minutes)</Label>
            <Input type="number" placeholder="60" className="bg-secondary/50 border-border/50" />
          </div>
          <Button className="mt-2">Save Configuration</Button>
        </CardContent>
      </Card>
    </div>
  );
}
