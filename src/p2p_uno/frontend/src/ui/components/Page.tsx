import "./Page.css";

function Page({ children }: { children: React.ReactNode }) {
    return (
        <>
            <header className="header">
                <h2>P2P Uno</h2>
            </header>
            <div className="content">{children}</div>
        </>
    );
}

export default Page;
