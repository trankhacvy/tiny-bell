import { Icon } from "@/components/dr/icon"

type Props = {
  /** Number of GitHub repos being monitored without any Actions history yet.
   *  When > 0 the copy changes to explain that specifically. */
  dormantGitHubRepos?: number
}

export function PopoverEmpty({ dormantGitHubRepos = 0 }: Props) {
  const githubOnly = dormantGitHubRepos > 0
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-12 text-center">
      <div className="mb-[14px] flex size-[44px] items-center justify-center rounded-full border border-dashed border-border text-faint">
        <Icon name="dot" size={14} />
      </div>
      <p className="mb-1 text-[13px] font-semibold text-foreground">
        {githubOnly ? "Watching, no runs yet." : "Suspiciously quiet."}
      </p>
      <p className="max-w-[260px] text-[12px] leading-[1.5] text-muted-foreground">
        {githubOnly
          ? `Tiny Bell is tailing ${dormantGitHubRepos} GitHub ${dormantGitHubRepos === 1 ? "repository" : "repositories"}, but none have triggered a workflow run in the last batch. They'll show up here as soon as a run starts.`
          : "Your accounts are connected but no deployments have landed yet. Push something and we'll start listening."}
      </p>
    </div>
  )
}
