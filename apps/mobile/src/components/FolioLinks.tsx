import { ArrowUpRight } from 'lucide-react'

const chapters = [
  { label: '安顿日常', pages: [['courses', '课表', '把一周摊开'], ['calendar', '日程', '为时间留一个位置'], ['todos', '待办', '一件一件，从容完成'], ['assignments', '作业', '截止之前，心中有数']] },
  { label: '留下与生长', pages: [['diary', '日记', '翻到某一天'], ['moods', '心情与回望', '让感受有迹可循'], ['ideas', '想法工坊', '从模糊处，慢慢成形']] },
  { label: '随时相连', pages: [['chat', '和小鱼说话', '语音或文字，由你选择'], ['settings', '连接与设置', '安顿设备与偏好']] },
]

/** One approved directory, shared by the compact drawer and wide-screen bookmark margin. */
export function FolioLinks({ current, go }: { current: string; go(page: string): void }) {
  return <>
    <button className="index-home" aria-current={current === 'home' ? 'page' : undefined} onClick={() => go('home')}>回到日常画布 <ArrowUpRight size={17}/></button>
    {chapters.map((chapter, group) => <section key={chapter.label}>
      <h3><span>0{group + 1}</span>{chapter.label}</h3>
      {chapter.pages.map(([id, label, hint]) => <button key={id} aria-current={current === id ? 'page' : undefined} onClick={() => go(id)}><span>{label}<small>{hint}</small></span><ArrowUpRight size={17}/></button>)}
    </section>)}
  </>
}
