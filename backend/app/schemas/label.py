from pydantic import BaseModel, StrictStr


class LabelRenameRequest(BaseModel):
    name: StrictStr


class LabelMergeRequest(BaseModel):
    targetId: StrictStr
