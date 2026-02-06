import { Spin } from "antd";

function LoadingIndicator({ title }: { title?: string }) {
    return (
        <Spin tip={title} size="large">
            {/*<div
                style={{
                    padding: 50,
                    // background: "inherit",background: 'rgba(0, 0, 0, 0.05)',
                    backgroundColor: "var(--background-color)",
                }}
            />*/}
        </Spin>
    );
}

export default LoadingIndicator;
