import "./PageTitle.css";

function PageTitle({ children }: { children: React.ReactNode }) {
    return (
        <div className="page-title">
            <h1>{children}</h1>
        </div>
    );
}

export default PageTitle;
