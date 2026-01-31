import { useContext, useState } from "react";
import { APIContext } from "../context";
import { useNavigate } from "react-router-dom";
import { Button, Form, Input, InputNumber } from "antd";
import BackButton from "../components/BackButton";
import Page from "../components/Page";

interface FormProps {
    name: string;
    max_players: number;
}

function CreateSession() {
    const api = useContext(APIContext)!;
    const navigate = useNavigate();

    const [error, setError] = useState("");

    const handleSubmit = (data: FormProps) => {
        console.log(data);
        if (data.max_players < 2 || data.max_players > 10) {
            return;
        }
        if (data.name.length < 3 || data.name.length > 20) {
            return;
        }
        void (async () => {
            const session = await api.createSession(
                data.name,
                data.max_players,
            );
            await navigate(`/session/${session.session_id}?is_host=true`);
        })().catch((error) => setError((error as { message: string }).message));
        // try {
        // } catch (error) {
        //     setError((error as { message: string }).message);
        // }
    };

    return (
        <Page>
            <div style={{ textAlign: "center" }}>
                <h1>Create Session</h1>
                <Form
                    layout="horizontal"
                    onFinish={handleSubmit}
                    initialValues={{
                        max_players: 6,
                    }}
                    labelCol={{ span: 12 }}
                    wrapperCol={{ span: 16 }}
                    style={{ maxWidth: 600, textAlign: "left" }}
                >
                    <Form.Item<FormProps>
                        label="Session Name"
                        name="name"
                        rules={[{ required: true }]}
                    >
                        <Input placeholder="Enter a Name" />
                    </Form.Item>
                    <Form.Item
                        label="Max. Player Count"
                        name="max_players"
                        rules={[{ required: true }]}
                    >
                        <InputNumber min={2} max={10} />
                    </Form.Item>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "row",
                            justifyContent: "space-around",
                        }}
                    >
                        <BackButton dest="/" />
                        <Button type="primary" htmlType="submit">
                            Create Session
                        </Button>
                    </div>
                    {/*<Form.Item
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            flexDirection: "row",
                        }}
                    >
                    </Form.Item>*/}
                </Form>
                {error && <p>{error}</p>}
            </div>
        </Page>
    );
}

export default CreateSession;
