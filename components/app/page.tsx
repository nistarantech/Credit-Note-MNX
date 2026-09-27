import { PageContainer } from "@/components/ui-patterns/page-container";
import {
  PageHeader, PageHeaderAside, PageHeaderDescription, PageHeaderMeta, PageHeaderSummary, PageHeaderTitle,
} from "@/components/ui-patterns/page-header";

/** Standard screen frame: Studio page header + contained body. */
export function Page({
  title, description, actions, size = "default", children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  size?: "small" | "default" | "large" | "full";
  children: React.ReactNode;
}) {
  return (
    <div className="pb-16">
      <PageHeader size={size} className="pt-8 no-print">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>{title}</PageHeaderTitle>
            {description ? <PageHeaderDescription>{description}</PageHeaderDescription> : null}
          </PageHeaderSummary>
          {actions ? <PageHeaderAside>{actions}</PageHeaderAside> : null}
        </PageHeaderMeta>
      </PageHeader>
      <PageContainer size={size} className="mt-6 flex flex-col gap-6">
        {children}
      </PageContainer>
    </div>
  );
}
