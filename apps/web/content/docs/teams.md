# Teams

Everything in Pluck belongs to a workspace: API keys, credits, usage, crawls, monitors, webhooks, model provider keys and proxies. You start with a personal workspace that only you can use. To work with other people, create a team workspace and invite them.

## Create a team

Open the workspace switcher at the top of the dashboard sidebar and choose **Create a team workspace**. You become its owner. A team has its own balance, starting at zero, and its own keys, so nothing in your personal workspace changes.

## Invite people

On **Team**, enter an email address and pick a role. The invitation link works for 7 days, and only for the person who signs in with the GitHub account whose verified email matches. If this instance has no email configured, the dashboard shows the link to copy and share yourself.

## Roles

| | Member | Admin | Owner |
|---|---|---|---|
| Create API keys, use the playground | ✓ | ✓ | ✓ |
| Create and manage monitors and webhooks | ✓ | ✓ | ✓ |
| Revoke their own keys | ✓ | ✓ | ✓ |
| Revoke anyone's keys | | ✓ | ✓ |
| Invite and remove people | | ✓ | ✓ |
| Buy credits, see invoices | | ✓ | ✓ |
| Manage model provider keys, proxies, the signing secret | | ✓ | ✓ |
| Rename the workspace | | ✓ | ✓ |
| Make or remove owners, delete the workspace | | | ✓ |

A workspace always has at least one owner. To step down, make someone else an owner first.

## Keys belong to the workspace

An API key acts for the workspace it was created in and spends that workspace's credits, whoever made it. The keys page shows who created each one. When someone leaves or is removed, the keys they created are revoked immediately. They could still have copies of those keys, so treat them as gone.

## Billing

Credits are bought per workspace, by its owners and admins. Invoices name the workspace's billing details, entered at checkout or in the payment portal.

## Leaving and deleting

**Settings** lets you leave a team, or, as an owner, delete it. Deleting a workspace removes its keys, monitors, usage history, crawls and webhook log for everyone, and forfeits its remaining credits. Deleting your account, under **Profile**, removes your personal workspace and any team you are the only member of. If other people still use a team where you are the only owner, hand it over first.
